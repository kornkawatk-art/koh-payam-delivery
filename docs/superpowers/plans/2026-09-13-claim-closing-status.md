# Plan — Claim "closed" status + outstanding-claims count

Spec: agreed in conversation 2026-09-13 via the grilling skill (2 rounds +
2 follow-up clarifications on the tab structure, confirmed with "ตรงกับที่
ต้องการ").

Branch: `feature/claim-closing-status` off `main`.

## Context

`claims.status` is a Postgres enum `('open', 'approved', 'rejected',
'closed')` (migration `0001_core_tables.sql`) — `'closed'` has existed since
day one but is never actually written by any code path today.
`resolveClaim()` (`src/lib/api/claims.ts`) only ever writes `'approved'` or
`'rejected'`. This leaves no way to tell, at a glance, which claims are
genuinely finished (nothing left to do) versus still needing a human to
follow through — specifically, an approved "ส่งชดเชยวันถัดไป" (resend next
day) claim queues a compensating shipment (`createResendBackorder` inserts
`backorders` rows) that isn't actually delivered until the team packs it
and marks it fulfilled on some later day's pack screen — a completely
separate step from the moment the claim was approved.

This feature makes `'closed'` a real, reachable state and uses it to answer
"how many claims are still outstanding" without changing any existing
filter tab's label or default behavior.

Read `src/lib/api/claims.ts`, `src/lib/api/backorders.ts`, and
`src/routes/team/ClaimsQueue.tsx` in full before starting.

## Agreed spec (do not re-derive, do not re-litigate)

- **When a claim reaches `'closed'`:**
  - Rejected claims: **do NOT** change — they keep `status = 'rejected'`
    forever, exactly as today. (Conceptually "rejected" already means
    "finished, nothing more to do" — see the outstanding-count definition
    below, which already treats it that way without needing to touch the
    stored value.)
  - Approved + `resolution: 'refund'`: `status` becomes `'closed'`
    **immediately**, at the same moment `resolveClaim` saves the decision
    (there is no in-app step that tracks "was the refund actually paid" —
    approving IS the finish line for this resolution).
  - Approved + `resolution: 'resend_next_day'`: `status` stays `'approved'`
    (unchanged from today) until the compensating shipment this claim
    queued is **actually delivered** — i.e. until every `backorders` row
    this claim created has been marked `fulfilled` via the existing
    `markBackorderFulfilled()` (called from `PackOrder.tsx` when the team
    packs and ships the carry-over item). At that point the claim
    transitions to `'closed'` **automatically**, with no separate manager
    confirmation step.
- **"Outstanding" (ค้างอยู่) is defined as:** `status IN ('open', 'approved')`
  — i.e. still awaiting a decision, or approved-but-the-resend-hasn't-
  shipped-yet. Everything else (`'rejected'`, `'closed'`) is not outstanding.
- **UI, `ClaimsQueue.tsx` — no new tab.** The existing four filter buttons
  (ทั้งหมด / เปิด / อนุมัติ / ปฏิเสธ) keep their exact labels and positions.
  Only the **"อนุมัติ" tab's query broadens**: instead of matching only
  `status = 'approved'`, it now matches `status IN ('approved', 'closed')`
  — so a claim that was approved and has since finished (refund closed
  instantly, or resend delivered) does not disappear from this tab; a
  manager browsing "อนุมัติ" still sees the claim's full history in one
  place. "เปิด" and "ปฏิเสธ" tabs are **unchanged** (`status = 'open'` /
  `status = 'rejected'` respectively — `'rejected'` never becomes
  `'closed'`, so this tab's query needs no change). "ทั้งหมด" is unchanged
  (no filter).
- **New: a summary count at the top of the page**, above the filter
  buttons, reading e.g. "ค้างอยู่ N รายการ" — counts `status IN ('open',
  'approved')` **regardless of which tab is currently selected** (i.e. it
  is not scoped by the active filter; it's a standing total).
- **Accepted limitation (do not attempt to solve in this plan):** if
  `createResendBackorder` fails when a claim is approved (an existing,
  already-handled error path — the manager is told to create the
  compensating backorder by hand), any backorder the manager creates
  manually afterward has no `claim_id` link back to the claim, so this
  claim will never auto-close via the fulfillment path. This is a rare,
  already-erroring fallback case; leave it as a known limitation, do not
  add a manual "force close" control for it.

## Global Constraints

- Stack unchanged: Vite + React 18 + TS + Tailwind 3, Vitest, Supabase.
- One migration file: `supabase/migrations/0019_claim_closing.sql`. No
  change to the `claim_status` enum (`'closed'` already exists). Add a
  single nullable `claim_id uuid references claims(id) on delete set null`
  column to `backorders`, plus a partial index on it (mirror the existing
  `create index on backorders (target_ship_date) where status = 'pending';`
  style — no explicit index name, matching this file's convention). This
  column is populated ONLY for rows `createResendBackorder` creates
  (`reason = 'claim_resend'`); shortage backorders (`syncShortageBackorders`)
  never set it and it stays `null` for them.
- `createResendBackorder(claimId)` in `src/lib/api/backorders.ts`: add
  `claim_id: claimId` to every row it inserts. No other change to this
  function.
- `markBackorderFulfilled(id)` in the same file: after the existing update
  that sets `status: 'fulfilled', fulfilled_at, fulfilled_by` succeeds
  (unchanged), read that backorder's `claim_id`. If it has one, check
  whether **every** `backorders` row sharing that `claim_id` now has
  `status = 'fulfilled'` (a `resend_next_day` claim referencing several
  products creates several rows — all must be delivered, possibly across
  different pack sessions/days, before the claim closes). If so, update
  that claim's row to `status: 'closed'`, guarded with `.eq('status',
  'approved')` in the same update call (so this is a no-op, not an error,
  if the claim is somehow already in a different state) and write an
  `audit_logs` row (`action: 'claim_auto_closed'`, `entity_type: 'claim'`,
  `entity_id: <claim id>`, `meta: { trigger: 'resend_fulfilled' }` — reuse
  this file's existing `logAction` import style from `claims.ts`, or call
  `supabase.from('audit_logs').insert(...)` directly if `backorders.ts`
  doesn't already import a shared audit helper — check first). **This
  entire check-and-maybe-close step must be best-effort and MUST NOT throw**
  out of `markBackorderFulfilled` — the backorder fulfillment itself has
  already succeeded by this point and must be reported as a success to the
  packer regardless of whether the claim-closing side effect works. Wrap it
  so any failure is swallowed (console.warn, matching this codebase's
  existing "secondary fetch failed, don't blank the primary UI" precedent
  in `ClaimDetail.tsx`'s evidence-photos loader), never re-thrown.
- `resolveClaim()` in `src/lib/api/claims.ts`: change how `patch.status` is
  computed. Today it's unconditionally `input.decision` (`'approved'` or
  `'rejected'`). New logic:
  - `input.decision === 'rejected'` → `'rejected'` (unchanged)
  - `input.decision === 'approved' && input.resolution === 'refund'` →
    `'closed'`
  - `input.decision === 'approved' && input.resolution === 'resend_next_day'`
    → `'approved'` (unchanged — waits for the fulfillment-triggered
    auto-close above)
  Everything else in this function (the `resolution`/`refund_amount`
  fields, the note-appending, the existing `createResendBackorder` call
  and its failure handling, the `logAction('claim_resolved', ...)` call)
  stays exactly as it is today — only the `status` value changes.
- `listClaims(filter)` in `src/lib/api/claims.ts`: its `filter.status` param
  must accept either a single string (existing behavior, `.eq('status',
  ...)`) or a string array (new: `.in('status', ...)`) so the "อนุมัติ" tab
  can request `['approved', 'closed']` while "เปิด"/"ปฏิเสธ" keep passing a
  plain string. Update the `ClaimRow`/`filter` type accordingly.
- New `countOutstandingClaims(): Promise<number>` in `src/lib/api/claims.ts`
  — a lightweight count query (`.select('id', { count: 'exact', head: true
  })` or equivalent, whichever this codebase's Supabase client version
  supports — check an existing count-style query elsewhere in this repo
  first, or fall back to selecting just `id` and reading `.length` if no
  precedent exists) filtered `status IN ('open', 'approved')`. Thai error
  message on failure, matching this file's convention.
- `ClaimsQueue.tsx`: the "อนุมัติ" filter button must now request
  `listClaims({ status: ['approved', 'closed'] })` instead of `{ status:
  'approved' }` — "เปิด"/"ปฏิเสธ"/"ทั้งหมด" buttons are unchanged. Add the
  new outstanding-count line above the filter buttons, loaded via
  `countOutstandingClaims()` independently of the claims-list fetch (own
  `useEffect`, own failure handling that must not blank the rest of the
  page if it fails — mirror this file's existing pattern for how the
  unmatched-backorders section already loads independently of the claims
  list).
- All existing tests must stay green, including the exact assertions in
  `src/lib/api/claims.test.ts` and `src/routes/team/ClaimsQueue.test.tsx`
  that currently expect the OLD behavior (e.g. `status: 'approved'` on a
  refund decision, `listClaims` called with `{ status: 'approved' }` on the
  "อนุมัติ" click) — these are EXPECTED to need updating to match the new
  spec; update them, don't leave them asserting stale behavior.
- Do not touch `submit-claim`, `register-line-contact`, or anything
  unrelated to claims/backorders.

## Task 1: Data layer — migration, backorders.ts, claims.ts

### 1a. `supabase/migrations/0019_claim_closing.sql`

Per Global Constraints: one nullable `claim_id` column on `backorders` +
partial index. Header comment explaining the feature and why the column is
nullable/only-set-for-resend-rows, matching this repo's migration comment
style (see `0013_manager_delete_orders.sql`, `0018_line_contact_approval.sql`
for tone).

### 1b. `src/lib/api/backorders.ts` (+ `.test.ts`)

- `createResendBackorder`: add `claim_id: claimId` to inserted rows.
- `markBackorderFulfilled`: add the read-claim_id → check-all-fulfilled →
  maybe-close-claim step per Global Constraints, best-effort/non-throwing.
  Factor the "are all of this claim's backorders fulfilled, and if so close
  it" logic into its own small helper function in this file so it's easy to
  unit-test in isolation (e.g. `closeClaimIfResendFulfilled(claimId:
  string): Promise<void>`, called from `markBackorderFulfilled` but not
  exported unless a test needs it exported — check the brief's test
  requirements below).

Tests to add: `createResendBackorder` now inserts `claim_id` on every row.
`markBackorderFulfilled` on a backorder with no `claim_id`: unchanged
behavior, no claim update attempted. On a backorder WITH a `claim_id`
where sibling rows (same `claim_id`) are NOT all fulfilled yet: no claim
update. Where ALL sibling rows (including the one just marked) ARE now
fulfilled: claim update fires with `status: 'closed'` and the
`.eq('status','approved')` guard, plus an audit log call. A single-item
claim (one backorder row) closes on that row's own fulfillment. A failure
in the claim-closing side path (e.g. the sibling-lookup query errors) does
NOT throw out of `markBackorderFulfilled` and does NOT prevent the
backorder's own fulfillment write from having already succeeded.

### 1c. `src/lib/api/claims.ts` (+ `.test.ts`)

- `resolveClaim`: new `patch.status` logic per Global Constraints.
- `listClaims`: `filter.status` accepts string or string[] per Global
  Constraints.
- New `countOutstandingClaims()` per Global Constraints.

Tests to update (existing, currently asserting stale behavior — fix these,
don't skip them): the refund-resolution test currently expects `status:
'approved'`, update its expectation to `status: 'closed'`. Rejected test
stays `status: 'rejected'` (unchanged, but re-confirm). resend_next_day
test stays `status: 'approved'` (unchanged, re-confirm). Tests to add:
`listClaims({ status: ['approved', 'closed'] })` issues an `.in()` call
with those exact two values (not two separate `.eq()` calls); a plain
string status still uses `.eq()` as before (regression-guard the existing
single-string path). `countOutstandingClaims()` issues the right filter and
returns the count; throws the Thai error on a query failure.

Report: `.superpowers/sdd/2026-09-13-claim-closing-status/task-1-report.md`.

## Task 2: UI — ClaimsQueue.tsx

### 2a. `src/routes/team/ClaimsQueue.tsx` (+ `.test.tsx`)

Per Global Constraints: "อนุมัติ" button now calls `listClaims({ status:
['approved', 'closed'] })`; add the outstanding-count line, loaded
independently (own effect/own failure handling, doesn't blank the rest of
the page on failure — read this file's existing unmatched-backorders
loading pattern first and mirror it). Exact Thai wording: something like
`ค้างอยู่ {n} รายการ` — check this file's/sibling pages' existing wording
conventions for a count-of-something line before finalizing exact phrasing
(e.g. how `DailyDashboard.tsx`'s progress bar or backorder-count banner
phrases a count) and match the closest existing precedent rather than
inventing new phrasing style.

Tests to update: the existing "changing the filter refetches with the
chosen status" test currently asserts
`listClaims` was last called with `{ status: 'approved' }` after clicking
"อนุมัติ" — update this assertion to `{ status: ['approved', 'closed'] }`.
Tests to add: the outstanding count renders the number
`countOutstandingClaims()` resolves with; a failure loading the count
doesn't blank the claims table or the unmatched-backorders section (mirror
this file's existing cross-section failure-isolation tests).

Report: `.superpowers/sdd/2026-09-13-claim-closing-status/task-2-report.md`.

## After both tasks: controller steps

- Apply migration `0019` to production (`supabase db push --linked`).
  Nothing else needs a redeploy — this feature touches only client-side
  code and a schema change, no edge function.
- No live-verification needed against LINE/edge functions this time; a
  normal `npx vitest run` + `npm run build` pass on merged `main` is
  sufficient given the nature of the change (pure DB schema + client
  logic, no external service integration). Still worth one manual sanity
  check in the live app if convenient: approve a claim with refund and
  confirm it shows under both "อนุมัติ" and disappears from the outstanding
  count; approve one with resend_next_day, confirm it stays counted as
  outstanding, then mark its backorder fulfilled on a pack screen and
  confirm the count drops and the claim still shows under "อนุมัติ".
- Update `docs/user-guide-th.md` section 10 (คิวเคลม) to mention the new
  outstanding count and the closed-status behavior.
- Merge to `main` with `--no-ff`, verify tests+build on merged main, delete
  the branch, clean the SDD workspace, commit the docs update, push only
  on explicit instruction.
