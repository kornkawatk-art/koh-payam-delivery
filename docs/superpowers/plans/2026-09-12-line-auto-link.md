# Plan — Auto-send the customer order link via LINE (no more manual copy-paste)

Spec: agreed in conversation 2026-09-12 (grilling session, "ยืนยันตามนี้").
Branch: `feature/line-auto-link` off `main`.

## Context

Today, a team member copies each order's `/o/<token>` link from OrderDetail
and pastes it manually into LINE, one customer at a time, every morning.
The team wants this automated. Researched during grilling (facts, not
guesses): **LINE Notify was fully discontinued March 31 2025** — the
current alternative is the **LINE Messaging API**, which can only push a
message to a customer who has already added the shop's LINE Official
Account (OA) as a friend, addressed by an internal `userId` that is only
obtainable once — via a LINE Login/LIFF flow or a webhook message event —
never derivable from a phone number alone. The shop already has an OA;
most customers have already added it; most are repeat customers; order
volume is 50+/day (will exceed LINE's free message quota, a real recurring
cost the team has accepted). The team has LINE Developers Console access
and will provision the Messaging API channel, a LIFF app, and hand the
controller the resulting Channel Access Token + LIFF Channel ID as
secrets — **this plan's code changes alone cannot go live**; a real,
external LINE Console setup step by the team is required first, and live
verification needs the team's cooperation (a real registered test LINE
account) since nothing here can be exercised by an automated test suite
against LINE's real servers.

## Global Constraints

- Stack unchanged: Vite + React 18 + TS + Tailwind 3, Vitest, Deno edge
  functions. Supabase cloud (`kprlqjxwolljkgqyzygf`).
- **One-time registration, LIFF-based**: a new public route
  (`/liff/register`, alongside the existing public `/o/:token` route —
  read `koh-payam-delivery/src/App.tsx` for the exact routing pattern to
  mirror) hosts a small form. Inside LINE's in-app browser, the LIFF SDK
  (`@line/liff` npm package — add it, pin an exact version like this
  project's other exact-pinned deps) auto-logs the visitor in and can
  produce an ID token (`liff.getIDToken()`) without any password step.
  The page: init LIFF with `VITE_LIFF_ID` (a new **public**, non-secret
  Vite env var — add to `.env.example`), get the ID token, let the
  customer type their phone number, POST `{ idToken, phone }` to a new
  edge function.
- **New edge function `register-line-contact`** (`verify_jwt = false` in
  `supabase/config.toml`, same reasoning as the existing customer-facing
  functions — no Supabase session exists in a LIFF browser context):
  verifies the ID token server-side by calling LINE's own verify endpoint
  (`https://api.line.me/oauth2/v2.1/verify?id_token=<token>&client_id=<LIFF
  channel id>`) — **never trust a client-supplied userId directly, always
  derive it from LINE's own verification response** (`sub` field =
  userId) — then upserts `{ phone, line_user_id, display_name }` into a
  new `line_contacts` table (upsert on `phone`, so a customer who
  re-registers, e.g. a new phone, overwrites their old mapping — a phone
  number should map to exactly one current LINE account). Validate the
  phone is non-empty before writing; beyond that, store it exactly as
  submitted (matching this codebase's existing lack of phone-format
  validation elsewhere, e.g. `buildImport.ts`'s `customerPhone` handling
  — read it for the established convention).
- **New table `line_contacts`**: `id uuid pk, phone text not null unique,
  line_user_id text not null, display_name text, created_at timestamptz
  not null default now()`. RLS enabled; **exactly one policy**,
  `team_read` (`for select to authenticated using
  (public.is_team_member())`) — mirror `claim_photos`'s/`claim_items`'s
  established "service-role-writes-only, team-can-read" shape (read
  `supabase/migrations/0015_claim_items.sql` for the exact syntax to
  copy) — no insert/update/delete policy; only edge functions using the
  service-role key ever write to this table.
- **New column `ship_days.links_sent_at timestamptz null`** — an
  idempotency guard: links for a given ship day are sent at most once,
  even if the boat list is edited and re-saved later that same day.
- **New edge function `send-order-links`** — called by an *authenticated
  team session* (unlike the other functions in this plan), so it uses
  this project's default `verify_jwt = true` (do **not** add a
  `[functions.send-order-links]` entry to `config.toml` — its absence is
  what keeps the default on). Body: `{ shipDate: string }`. Steps:
  1. Read `ship_days` for `shipDate`; if `links_sent_at` is already set,
     return `{ ok: true, sent: 0, skipped: true }` immediately — no-op,
     this is the idempotency guard.
  2. Load every order for `shipDate` (`id, customer_name_en,
     customer_phone, link_token`).
  3. **Dedup by phone**: group orders by `customer_phone`, keep only the
     first order per phone group (a customer with several same-day POs
     gets exactly one message — the existing `/o/<token>` page already
     cross-links to their sibling orders, so sending more than one
     message per person is redundant, not more informative).
  4. For each deduped order whose phone has a row in `line_contacts`,
     call LINE's push endpoint (`POST https://api.line.me/v2/bot/message/
     push`, `Authorization: Bearer <LINE_CHANNEL_ACCESS_TOKEN>`, body
     `{ to: line_user_id, messages: [{ type: 'text', text: <message> }] }`).
     A phone with no `line_contacts` row is simply skipped — the
     existing manual "คัดลอก" button on `OrderDetail.tsx` is the
     intended fallback, unchanged, for exactly this case; do not add any
     new UI to flag "unregistered" customers in this plan.
  5. **Each push is independent — one recipient's failure (LINE API
     error, e.g. the customer blocked the OA) must not stop the rest of
     the batch.** Catch per-recipient, keep counts of sent/failed, keep
     going.
  6. After the loop (regardless of any individual failures), set
     `ship_days.links_sent_at = now()` — a partial-failure run still
     counts as "attempted for today," it must not retry-storm on every
     later `setBoats` save that day.
  7. Return `{ ok: true, sent: <n>, failed: <n>, skipped: false }`.
  Message text: a short, plain Thai line plus the link — no customer
  name needed (avoids an awkward Thai/English name mix, since
  `customer_name_en` is often in English). Exact copy is the
  implementer's call within that spirit; keep it short.
- **`koh-payam-delivery/src/routes/team/BoatSetup.tsx`**: read the whole
  file first. After `setBoats(shipDayId, boats)` succeeds inside `save()`,
  call the new `sendOrderLinks(date)` client function (new export in
  `koh-payam-delivery/src/lib/api/shipDays.ts` or a new small file — your
  call, but keep it in the existing API-layer convention: `fetch` the
  edge function with the team session's access token as `Authorization:
  Bearer`, mirroring `requestUploadUrl`'s pattern in
  `koh-payam-delivery/src/lib/api/photos.ts` for attaching a real session
  token to an edge-function call, not the anon key). Its result folds
  into the existing `msg` state (e.g. append "· ส่งลิงก์ไลน์ N ฉบับ" to
  the existing "บันทึกรายการเรือแล้ว" success message). **A failure in
  `sendOrderLinks` must not make the boat save itself look like it
  failed** — `setBoats` already succeeded; only the link-sending sub-step
  failed. Show that distinctly (mirror how `resolveClaim` already
  handles "the main action succeeded but a secondary step failed" — read
  that function in `koh-payam-delivery/src/lib/api/claims.ts` for the
  established message-composition pattern).
- **Secrets** (controller sets these via `supabase secrets set`,
  documented in `docs/ops-runbook-th.md`'s existing secrets section —
  update that doc too, see below): `LINE_CHANNEL_ACCESS_TOKEN` (used by
  `send-order-links`), `LIFF_CHANNEL_ID` (used by `register-line-contact`
  to verify the ID token's audience). These do not exist yet — the team
  provisions them from the LINE Developers Console and hands them to the
  controller after this task is reviewed and ready to deploy; the
  implementer writes code that reads them from `Deno.env.get(...)`,
  same convention as every other edge function in this codebase, but
  cannot test against real values.
- All existing tests must stay green. `send-order-links` and
  `register-line-contact` cannot be exercised end-to-end by vitest (no
  real LINE servers, no Docker/local Supabase in this environment) — test
  the surrounding logic that vitest *can* reach (the dedup-by-phone
  grouping, the idempotency check, the client-side `BoatSetup.tsx`
  wiring) and note in the report, same as this branch's prior
  edge-function tasks, that live verification is a controller step after
  real secrets exist.

## Task 1 — Registration (LIFF page + table + edge function)

### 1a. Migration `koh-payam-delivery/supabase/migrations/0016_line_contacts.sql`

```sql
create table line_contacts (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  line_user_id text not null,
  display_name text,
  created_at timestamptz not null default now()
);

alter table line_contacts enable row level security;
create policy team_read on line_contacts for select to authenticated
  using (public.is_team_member());
```

No grant/revoke needed here (unlike `create_claim` in migration 0015) —
this is a plain table with RLS, not a `security definer` function; the
service-role key used by edge functions bypasses RLS by design, and no
`authenticated`/`anon` write path exists at all since there's no insert/
update/delete policy.

### 1b. New edge function `koh-payam-delivery/supabase/functions/register-line-contact/index.ts`

Read `koh-payam-delivery/supabase/functions/submit-claim/index.ts` in
full first for this codebase's established edge-function conventions
(CORS import from `../_shared/cors.ts`, JSON response shape, Thai error
strings, service-role client construction). Add
`[functions.register-line-contact]` with `verify_jwt = false` to
`supabase/config.toml`, in the same style/comment-block as the existing
customer-facing functions there.

- `POST { idToken: string, phone: string }`.
- Validate both fields are non-empty strings; 400 otherwise.
- Call LINE's verify endpoint with `idToken` + `LIFF_CHANNEL_ID` (from
  `Deno.env.get('LIFF_CHANNEL_ID')`); on any non-2xx or a response
  missing `sub`, return 401 (do not trust the request further).
- Upsert `line_contacts` on `phone` (service-role client) with
  `{ phone, line_user_id: <verified sub>, display_name: <verified name,
  if present> }`.
- `{ ok: true }` on success; the file's usual Thai-error JSON shape on
  any DB failure.

Test coverage: no Deno test harness exists in this repo for edge
functions (confirmed by prior tasks) — do not introduce one. This
function's logic is thin enough that a careful read during review
substitutes for automated coverage, same as every other edge function
change this session.

### 1c. New customer route `koh-payam-delivery/src/routes/customer/LineRegister.tsx` (+ `.test.tsx`)

Read `koh-payam-delivery/src/routes/customer/CustomerClaimForm.tsx` for
this codebase's established plain-component style (no external UI
framework, Thai copy, `useState`-based busy/error handling) — match it,
even though this page's mechanics (LIFF SDK) are new to this codebase.

- Add `@line/liff` to `package.json` (exact pinned version, check npm for
  current stable).
- On mount: `liff.init({ liffId: import.meta.env.VITE_LIFF_ID })`; if not
  logged in inside the LIFF context, call `liff.login()` (LIFF handles
  this — inside LINE's app it's automatic, no separate password step for
  the customer).
- A single phone-number `<input>` + submit button. On submit: get
  `liff.getIDToken()`, POST `{ idToken, phone }` to
  `register-line-contact` (same `fetch` + anon-key-bearer pattern as
  `requestUploadUrl` in `photos.ts` for a no-session customer call), show
  a Thai success/error message. Keep it to one screen, no multi-step
  flow.
- Add `VITE_LIFF_ID` to `.env.example` (a placeholder value, documented
  as "public, not secret — safe to expose in the built frontend").
- Wire the route in `koh-payam-delivery/src/App.tsx`: `<Route
  path="/liff/register" element={<LineRegister />} />` at the same
  top-level, outside `RequireAuth`, next to the existing `/o/:token`
  route — read that file's exact existing comment style for the `/o/
  :token` route and add a matching one-line comment for this route too.
- Tests (`LineRegister.test.tsx`): mock the `@line/liff` module and
  `fetch` — cover the happy path (submits `{idToken, phone}`, shows
  success), a verify/registration failure (shows a Thai error, does not
  crash), and that the LIFF init/login sequence is invoked on mount.

### 1d. Tests

Full list run at the end: `LineRegister.test.tsx` (new). No migration
tests exist in this codebase's convention (SQL is controller-verified
live) — none added here either.

Report: `.superpowers/sdd/2026-09-12-line-auto-link/task-1-report.md`.

## Task 2 — Auto-send after boat setup

Depends on Task 1's `line_contacts` table existing (same branch, applied
in sequence — no cross-branch dependency).

### 2a. Migration `koh-payam-delivery/supabase/migrations/0017_ship_days_links_sent.sql`

```sql
alter table ship_days add column if not exists links_sent_at timestamptz;
```

### 2b. New edge function `koh-payam-delivery/supabase/functions/send-order-links/index.ts`

Read `koh-payam-delivery/supabase/functions/order-view/index.ts` in full
first (another function reading `orders` broadly, for the established
select-shape/error conventions) — this one is different in one respect:
it's the first edge function in this codebase meant to be called by an
**authenticated team session**, not a customer link. Do **not** add a
`[functions.send-order-links]` block to `config.toml` — leaving it out
keeps `verify_jwt` at its default `true`, which is what's wanted here
(the Supabase gateway rejects the call before your code even runs if the
bearer isn't a real, valid session — read the comment already in
`config.toml` right above the `[functions.order-view]` block explaining
why the *other* functions are `false`, and make sure this function's
absence from that list is deliberate, not an oversight).

- `POST { shipDate: string }`.
- Inside the function, additionally confirm the caller is an active team
  member via a service-role `profiles` lookup on the JWT's `sub`
  (mirrors this codebase's `is_team_member()` check, done here in
  TypeScript since RLS alone can't gate an edge function's own business
  logic) — reject with 403 otherwise. This is defense-in-depth on top of
  `verify_jwt`, not a replacement for it.
- Implement the exact 7-step algorithm from the Global Constraints
  section above (idempotency check, load+dedup orders, per-recipient
  push with independent failure handling, set `links_sent_at`, return
  counts).
- LINE push failures (per recipient) must be logged (e.g. `console.error`
  with the phone/order id, not the full response body if it could
  contain anything sensitive) but must not throw past the per-recipient
  `try/catch` — the loop must always complete and `links_sent_at` must
  always get set at the end, per Global Constraints point 6.

Test coverage: same note as 1b — no Deno test harness in this repo;
read-carefully-at-review substitutes for automated coverage on the LINE
API call itself. However, the **dedup-by-phone logic** and the
**idempotency check** are exactly the kind of pure logic this codebase
already tests by extracting small helper functions and unit-testing them
— consider whether factoring "group orders by phone, keep first per
group" into a small exported pure function (testable with plain vitest,
no Deno/network involved) is worth it; if so, put it somewhere sensible
and add a real test for it. This is a judgment call, not a hard
requirement — use it if it doesn't overcomplicate a fairly small
function.

### 2c. `koh-payam-delivery/src/lib/api/shipDays.ts`

New `export async function sendOrderLinks(shipDate: string): Promise<{ sent: number; failed: number; skipped: boolean }>`
— POSTs to `send-order-links` with the current team session's access
token as `Authorization: Bearer` (same session-attachment pattern
`requestUploadUrl` uses for `evidence` scope in `photos.ts` — read it
again here for the exact shape). Throw this file's Thai-error convention
on a non-2xx response; return the parsed `{ sent, failed, skipped }` on
success.

Test (`shipDays.test.ts`): a successful call returns the parsed counts;
a non-2xx response throws the Thai error.

### 2d. `koh-payam-delivery/src/routes/team/BoatSetup.tsx`

Per the Global Constraints bullet above: call `sendOrderLinks(date)`
right after a successful `setBoats`, fold its result into the existing
`msg` state without making a link-sending failure look like the boat
save itself failed.

Test (`BoatSetup.test.tsx`): saving boats successfully also calls
`sendOrderLinks` with the right date and the success message reflects
the returned count; a `sendOrderLinks` failure still shows the boat-save
success (distinctly, not silently swallowed — assert some failure text
is shown) rather than reporting the whole save as failed.

### 2e. Tests

Full list run at the end: `shipDays.test.ts`, `BoatSetup.test.tsx`.

Report: `.superpowers/sdd/2026-09-12-line-auto-link/task-2-report.md`.

## After both tasks: docs

Update `docs/ops-runbook-th.md`'s secrets section (ส่วน A5 / ขั้นที่ 4)
to list `LINE_CHANNEL_ACCESS_TOKEN` and `LIFF_CHANNEL_ID` alongside the
existing R2/CLEANUP_SECRET entries, and add a short new subsection
explaining what the team must do in the LINE Developers Console before
this feature can go live (open Messaging API on the existing OA, create
a LIFF app pointed at `<site>/liff/register`, copy the Channel Access
Token + the LIFF's own channel id into the secrets list above), plus a
one-line note that message volume at this shop's real order count will
exceed LINE's free quota and requires a paid OA plan. Update
`docs/user-guide-th.md`'s §7 (ตั้งค่าเรือประจำวัน) to mention that
saving the boat list also sends today's LINE links automatically, and
add a short new note near §9's "ลิงก์ลูกค้า" box that the "คัดลอก"
button is now specifically the fallback for a customer who hasn't done
the one-time LINE registration yet.
