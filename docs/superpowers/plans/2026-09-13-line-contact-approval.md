# Plan — Manager approval before overwriting a LINE contact with a different account

Spec: agreed in conversation 2026-09-13 via the grilling skill (2 rounds,
confirmed with "ยืนยันตามนี้").

Branch: `feature/line-contact-approval` off `main`.

## Context

`register-line-contact` (from `feature/line-auto-link`) upserts
`phone -> line_user_id` unconditionally: if a phone already has a *different*
`line_user_id` stored, the new registration silently overwrites it and the
old LINE account stops receiving that phone's order links. There is no
detection of this case today — first-time registration and a genuine
cross-account overwrite are indistinguishable to the system.

This feature adds a manager approval gate for that one case only. Read
`supabase/functions/register-line-contact/index.ts`,
`src/routes/customer/LineRegister.tsx`, `src/routes/team/LineContacts.tsx`,
and `src/lib/api/lineContacts.ts` in full before starting — every task below
edits one of these four files (or a close sibling).

## Agreed spec (do not re-derive, do not re-litigate)

- **When approval is required**: ONLY when a phone already has a
  `line_contacts` row AND the newly-verified `line_user_id` (from LINE's own
  `/oauth2/v2.1/verify` response, never client input) differs from the
  stored `line_user_id`. Two cases stay instant, no approval, exactly as
  today:
  - No existing row for the phone (first-time registration).
  - Existing row with the SAME `line_user_id` (e.g. refreshing display name).
- **Customer-facing behavior**: when a request lands in the pending state,
  `register-line-contact` returns `{ ok: true, pending: true }` (instead of
  `{ ok: true }`), and `LineRegister.tsx` shows a distinct message —
  "คำขอกำลังรอตรวจสอบ" — instead of the normal success message. The old
  LINE account's mapping is untouched and keeps receiving links in the
  meantime.
- **Storage**: three new nullable columns directly on `line_contacts`:
  `pending_line_user_id text`, `pending_display_name text`,
  `pending_requested_at timestamptz`. A pending request is "does this row
  have `pending_line_user_id is not null`" — no separate table. A second
  overwrite attempt while one is already pending simply overwrites these
  three columns again (last request wins; this is the agreed behavior, not
  a bug).
- **Manager screen**: folded into the existing `src/routes/team/LineContacts.tsx`
  page (no new route). Add a "คำขอรออนุมัติ" section showing, per pending
  row: old LINE display name vs new (pending) LINE display name, the phone
  number, and the request date. Each row gets an "อนุมัติ" and "ปฏิเสธ"
  button (mirror `ClaimDetail.tsx`'s decision-button conventions where
  reasonable, but this is a two-button list-row action, not a full
  detail-page form — do not build a separate detail page for it).
- **Approve**: `line_user_id` / `display_name` become the pending values;
  all three `pending_*` columns clear back to `null`. Write an `audit_logs`
  row (see below).
- **Reject**: all three `pending_*` columns clear back to `null`;
  `line_user_id` / `display_name` are untouched (still the old owner). No
  customer-facing notification of any kind. Write an `audit_logs` row.
- **Write path for approve/reject**: direct client-side Supabase calls from
  `src/lib/api/lineContacts.ts`, gated by a new manager-only RLS UPDATE
  policy on `line_contacts` — mirror the existing `claims_update_manager`
  policy shape from `supabase/migrations/0013_manager_delete_orders.sql`
  (`public.is_manager()` already exists from that migration; reuse it,
  do not redefine it). This mirrors `resolveClaim()` in
  `src/lib/api/claims.ts` (read-then-write from the client, no new edge
  function) — do the same here, not a new edge function. `audit_logs`
  already has a `team_write` INSERT policy gated on `is_team_member()`
  from migration `0007`, which a manager satisfies; no audit_logs policy
  change is needed.

## Global Constraints

- Stack unchanged: Vite + React 18 + TS + Tailwind 3, Vitest for the client,
  Deno for edge functions (existing Deno tests live beside their functions,
  e.g. `supabase/functions/send-order-links/guards.test.ts` — this feature
  has no isolated pure-logic helper worth extracting into its own tested
  file; the branching lives inline in `register-line-contact/index.ts` and
  is exercised by live/manual verification the same way the rest of that
  function already is, not a Deno unit test).
- One migration file: `supabase/migrations/0018_line_contact_approval.sql`.
  Header comment explaining the feature, same style as `0013_manager_delete_orders.sql`.
  Do not touch the existing `team_read` policy on `line_contacts` from
  migration `0016`.
- `register-line-contact/index.ts`: keep every existing check (rate limit,
  idToken/phone validation, phone normalization, LINE verify, recent-order
  gate) completely unchanged. Only the write branch (currently a single
  unconditional `upsert`) and the final response/audit-log change. The
  existing `existing` read (`select('id')`) must become
  `select('id, line_user_id, display_name')` so the branch can compare
  `line_user_id` and read the *old* display name for the pending case (the
  approve step later needs "old vs new display name", which the client
  page reads straight off `line_contacts` — no need to duplicate old-name
  storage anywhere else).
- Audit log actions: keep `'line_contact_registered'` for both the
  first-time and same-account-refresh direct-write cases (unchanged from
  today). Add `'line_contact_pending_created'` for the pending case, and
  `'line_contact_approved'` / `'line_contact_rejected'` for the manager's
  two actions. Every audit row keeps the existing shape (`user_id`,
  `action`, `entity_type: 'line_contact'`, `entity_id: <phone>`, `meta`).
  For approve/reject, `user_id` is the acting manager's id (from
  `supabase.auth.getUser()`, same pattern as `resolveClaim`), and `meta`
  should include both the old and new `line_user_id` for a human
  reconstructing what happened.
- `LineRegister.tsx`: `submitState` gets a new `'pending'` value alongside
  `'idle' | 'busy' | 'success' | 'error'`. On a successful response, branch
  on `json.pending` to choose `'success'` vs `'pending'`; render the
  pending message in an `alert alert-warn` (matching this codebase's
  existing color convention: `alert-ok` for unconditional success,
  `alert-warn` for "succeeded but needs attention", `alert-danger` for
  failure — confirm this convention by grepping `alert-warn`/`alert-ok`
  usage elsewhere before writing the JSX).
- `src/lib/api/lineContacts.ts`: add
  `listPendingLineContactRequests(): Promise<PendingLineContactRow[]>`
  (selects `phone, display_name, pending_display_name, pending_requested_at`
  from `line_contacts` where `pending_line_user_id` is not null, ordered
  oldest-request-first so the manager clears the backlog in request order)
  and `resolveLineContactRequest(phone: string, decision: 'approve' |
  'reject'): Promise<void>` (read-then-write against the phone's row,
  exactly `resolveClaim`'s shape: select the current row first — needed for
  `approve` to copy `pending_line_user_id`/`pending_display_name` into
  `line_user_id`/`display_name`, and for the audit meta's old-vs-new — then
  a single `update`). Thai error strings on failure, matching this file's
  existing convention.
- `src/routes/team/LineContacts.tsx`: add the pending-requests section per
  the agreed spec above. Each row's buttons call
  `resolveLineContactRequest` and refresh both the pending list and the
  main table on success (a manager approving a request should immediately
  see it leave the pending section — don't require a page reload). Keep
  the existing main table and search box unchanged.
- All existing tests must stay green. New/changed client-side logic
  (`lineContacts.ts`, `LineContacts.tsx`, `LineRegister.tsx`) gets tests
  in this codebase's existing style for those files/siblings.
- Do not touch `send-order-links`, `submit-claim`, or anything unrelated to
  this phone/LINE-contact registration flow.

## Task 1: Migration + `register-line-contact` edge function

### 1a. `supabase/migrations/0018_line_contact_approval.sql`

```sql
-- 0018_line_contact_approval.sql
-- Manager approval gate before a phone's line_contacts row can be
-- re-registered to a DIFFERENT LINE account (feature/line-contact-approval).
-- First-time registration and same-account refreshes are unaffected -- see
-- register-line-contact/index.ts for the branch that decides which path a
-- request takes.

alter table line_contacts
  add column if not exists pending_line_user_id text,
  add column if not exists pending_display_name text,
  add column if not exists pending_requested_at timestamptz;

-- public.is_manager() already exists (supabase/migrations/0013_manager_delete_orders.sql).
create policy manager_update on line_contacts for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
```

### 1b. `supabase/functions/register-line-contact/index.ts`

Per Global Constraints:
1. Change the existing pre-write `select('id')` to
   `select('id, line_user_id, display_name')`.
2. Replace the single unconditional `upsert` with the three-way branch:
   - no `existing` row, OR `existing.line_user_id === verified.sub` → same
     `upsert(..., { onConflict: 'phone' })` as today (unchanged behavior).
   - `existing.line_user_id !== verified.sub` → instead, `update` only
     `pending_line_user_id: verified.sub`, `pending_display_name: verified.name
     ?? null`, `pending_requested_at: new Date().toISOString()` on the row
     matching `phone: normalizedPhone`. Do NOT touch `line_user_id` or
     `display_name` in this branch.
   - Both branches keep the existing `if (error) { ...500... }` shape.
3. Audit log: `'line_contact_registered'` for the first branch (unchanged
   `meta: { replacedExisting: Boolean(existing) }`), `'line_contact_pending_created'`
   for the second branch (`meta: { oldLineUserId: existing.line_user_id }`
   — do not include the new/pending line_user_id in the audit meta of the
   *customer-facing* request creation; that would defeat the point of
   requiring manager review of a diff nobody has looked at yet — instead
   let the manager see it live on the page when they act).
4. Final response: `{ ok: true, pending: <true|false> }` — `pending` is
   `true` only for the second branch.

Report: `.superpowers/sdd/2026-09-13-line-contact-approval/task-1-report.md`.

## Task 2: Client — pending message, API functions, manager UI

### 2a. `src/routes/customer/LineRegister.tsx`

Per Global Constraints: `submitState` gains `'pending'`; branch on
`json.pending` after a successful response; render the pending message.
Test: submitting when the response has `pending: true` shows the pending
message, not the normal success message; existing success/error paths
stay covered.

### 2b. `src/lib/api/lineContacts.ts`

Add `PendingLineContactRow` type (`phone`, `oldDisplayName`,
`pendingDisplayName`, `requestedAt`) and the two functions per Global
Constraints:
- `listPendingLineContactRequests()`: selects
  `phone, display_name, pending_display_name, pending_requested_at`,
  filters `pending_line_user_id is not null`
  (`.not('pending_line_user_id', 'is', null)`), orders
  `pending_requested_at` ascending. Maps to `PendingLineContactRow`.
- `resolveLineContactRequest(phone, decision)`: selects the row by
  `phone` first (`line_user_id, display_name, pending_line_user_id,
  pending_display_name`); if `decision === 'approve'`, updates
  `line_user_id`/`display_name` to the pending values and clears all
  three `pending_*` columns; if `'reject'`, clears only the three
  `pending_*` columns. Both then insert an `audit_logs` row
  (`action: 'line_contact_approved' | 'line_contact_rejected'`,
  `entity_type: 'line_contact'`, `entity_id: phone`, `user_id` from
  `supabase.auth.getUser()`, `meta: { oldLineUserId, newLineUserId }` —
  for reject, `newLineUserId` is the pending value that got discarded,
  for audit-trail completeness). Thai error on any failure.

Test file: assert the exact `.select()`/`.eq()`/`.order()`/filter args
(matching this codebase's existing convention of asserting query shape,
e.g. `lineContacts.test.ts`'s existing test for `listLineContacts`), and
that approve vs reject write the right columns.

### 2c. `src/routes/team/LineContacts.tsx`

Add the pending-requests section per Global Constraints, loaded via
`listPendingLineContactRequests()` alongside the existing
`listLineContacts()` call. Each row: phone, old display name vs pending
display name, formatted request date (`formatDateTimeTH`), "อนุมัติ" /
"ปฏิเสธ" buttons wired to `resolveLineContactRequest`, refreshing both
lists on success. Empty state when there are no pending requests: hide
the section entirely, or show a short muted line — check this codebase's
convention for an optional/collapsible section with zero rows before
picking (e.g. `DailyDashboard.tsx`) and match it.

Tests: renders a pending row with both display names and the phone;
approve button calls `resolveLineContactRequest(phone, 'approve')` and
removes the row from the pending section on success; reject button same
shape with `'reject'`; section absent/empty-state shown when there are no
pending rows.

### 2d. Full test run

`lineContacts.test.ts`, `LineContacts.test.tsx`, `LineRegister.test.tsx`
(if it exists — check), and the full suite (`npm test` / `npx vitest run`)
to confirm nothing else broke.

Report: `.superpowers/sdd/2026-09-13-line-contact-approval/task-2-report.md`.

## After both tasks: controller steps

- Apply migration `0018` to production (`supabase db push` from a session
  with the linked project).
- Redeploy `register-line-contact` (`supabase functions deploy
  register-line-contact`).
- Live-verify: create a real temporary `line_contacts` row (or reuse the
  test phone from the original LINE feature work) with a synthetic
  `line_user_id`, then exercise `register-line-contact` with a *different*
  verified LINE identity (the real test LINE account already used during
  the original A6 walkthrough) and confirm: (a) the row's `line_user_id`
  is untouched, (b) `pending_*` columns are populated, (c) the manager
  page's pending section shows it, (d) approving flips `line_user_id` and
  clears `pending_*`, (e) rejecting clears `pending_*` and leaves
  `line_user_id` untouched. Clean up any test data afterward and confirm
  row counts return to baseline, matching this session's established
  live-verification discipline.
- Update `docs/user-guide-th.md`'s §11 ("ผู้ลงทะเบียน LINE") to describe
  the new pending-approval section and what a manager should do with it.
- Merge to `main` with `--no-ff`, verify tests+build on merged main, delete
  the branch, clean the SDD workspace, commit the docs update, push only
  on explicit instruction (matching this session's established push
  discipline).
