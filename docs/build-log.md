# Build log — Koh Payam delivery app (Phase 1)

Built 2026-09-06 → 2026-09-10 from `docs/superpowers/specs/…-design.md` and
`docs/superpowers/plans/…-koh-payam-delivery-app.md` (27 tasks, each
implemented + reviewed test-first, then a whole-branch review + fix pass).
This branch is a squash of that work; the leaked-key scratch file that
briefly lived in the task-by-task history was dropped in the squash.

## What shipped

**Frontend** (`koh-payam-delivery/`): Vite + React 18 + TS + Tailwind 3, Vitest (142 tests).
- Team (Thai): email login + TOTP 2FA + roles (packer/pier/manager); Makro CSV/XLSX import with column-mapping + overwrite guard; daily dashboard (realtime); pack screen (shortage marking → auto backorders); printable box-label worksheet; per-day boat list; pier loading (boat + evidence photos + ship-off, gated); order detail (customer link, credit summary, audit); claims queue + resolution (refund / next-day resend).
- Customer (`/o/:token`, no login, EN default + TH toggle): status timeline, items, shortages, boxes/boat, evidence photos, payment/credit summary, 48h claim form. Link 404s after the 48h claim window.

**Backend** (Supabase project, region ap-southeast-1):
- Migrations `0001`–`0007`: schema + enums + RLS on every table + triggers (box generation, shipped_at, profile autocreate, R2-key capture on delete), 30-day `purge_old_orders()` + pg_cron.
- Edge Functions (Deno, all `verify_jwt=false`, own auth): `order-view` (token → sanitised order JSON), `photo-upload-url` (presigned R2 PUT via aws4fetch), `submit-claim`, `cleanup` (drains `r2_delete_queue` → R2 delete).
- Cloudflare R2 for photos; two pg_cron jobs (`purge-old-orders` 03:00, `r2-cleanup` 03:10).

## Security posture (from the final whole-branch review)

- **Public signup DISABLED** on the Supabase project (was the default-on hole: anon key ships in the bundle → self-register → RLS `authenticated` = full data access). Verified: signup returns `signup_disabled`.
- **Defense in depth** (migration 0007): `profiles.is_active` + `public.is_team_member()`; every team data policy re-scoped from `using(true)` to `is_team_member()`. A user with a JWT but no active team profile sees nothing. New team members: create the Supabase Auth user, then `update public.profiles set role=…, is_active=true where id=…`.
- `order-view` returns an explicit allowlist (no `link_token`/ids/audit); customer link expires 48h after ship-off; team `[ทีม]` notes are stripped from the customer view.
- Browser end-to-end smoke (login → 2FA → import → dashboard) verified against the live backend; edge functions curl-smoked (sanitisation, auth denial, presigned PUT, claim write, R2 delete).

## Still required before real customer data

1. Vercel deploy of the frontend (needs a GitHub repo + Vercel account) — `docs/ops-runbook-th.md` section B.
2. Cloudflare R2 bucket **CORS** (dashboard step) — documented, not yet set.
3. Run the runbook section B step-5 smoke once the site is live (only check covering the browser session + RLS + realtime + R2 CORS together).
4. Rotate the R2 + Supabase service-role keys at handoff (they sat in a synced-folder file).

## Deferred to Phase 2 (from the review; none block Phase-1 use)

- RLS `aal2` requirement (2FA is enforced in the UI, not yet in the DB policies).
- Deno unit tests for the four edge functions (currently only curl smoke + a controller run).
- `on delete set null` on `evidence_photos.taken_by` / `claims.resolved_by` / `backorders.fulfilled_by` / `audit_logs.user_id` so team members can be hard-deleted (Phase 1: ban / deactivate instead).
- `resolution_note` column so a manager's internal note isn't part of `claims.description`.
- Responsive `AppShell` (fixed `w-48` sidebar) for the phone-first pier screen.
- Presigned-PUT size cap; edge-fn rate-limit eviction; `cleanup` dead-letter column; shared `useOrder` hook; per-order import audit granularity.
- Pre-existing dev-only `npm audit` advisories (esbuild/vite via vitest@2, react-router 6) — need major bumps.
