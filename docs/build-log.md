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

## Rework 2026-09-10 — fit the real Makro export (branch `rework/makro-import`, merged `f476526`)

The real Makro export files didn't match the Phase-1 import assumptions.
After a grilling session the import model was redesigned (plan
`docs/superpowers/plans/2026-09-10-makro-import-rework.md`, 10 tasks / 3
batches, each reviewed):

- **2-file import**: `OrderDetailExport` (line items) + `OrderExport`
  (delivery address). Koh Payam filter = `Sub District == "เกาะพยาม"` OR
  shipping address matches `ไต๋แขก` / `Taikak` (pier).
- **All money removed** — the real file has no unit price. Dropped the
  credit/value UI everywhere (customer page, dashboard, order detail,
  claims), deleted `credit.ts` + `CreditSummaryTable`, and `order-view`
  no longer returns a `credit` block. Migration `0008` drops
  `order_items.unit_price` + `orders.total_value_cached`.
- **Shortage from Makro**, not manual marking: a line is short when
  `qty_shipped < qty_ordered`; backorder qty comes from `shortage_qty`.
  Pack screen is now read-only line items + box counts.
- **Non-destructive re-import**: sync by Makro order no; protected
  columns (status, boat, boxes, photos…) preserved; `order_items`
  replaced. Dropped the `packing` status from the app (enum value left
  in the DB, unreferenced).
- Customer page shows ordered vs shipped per line ("ส่ง X / สั่ง Y").

Migration `0008` applied to cloud and verified; `order-view` re-deployed
and live-smoked. 153 tests pass, build green. Browser smoke was skipped
at the user's request — coverage rested on the unit suite (new
`buildImport` / `commitImport` / 2-file `ImportOrders` / `CustomerOrderView`
tests), the green `tsc`+`vite` build, three review passes, and the
`order-view` live cloud smoke.

## UI polish + pack-stage photos 2026-09-10 (on `main`)

- **Responsive visual system** (`d533470`): Tailwind design tokens (warm
  stone neutrals + one ochre accent), Inter + IBM Plex Sans Thai, an
  `index.css` component layer (`.card` / `.btn` / `.badge` / `.alert` /
  `.table-wrap` / `.data-table` / `.field`), semantic form-control base,
  focus rings, `prefers-reduced-motion`. `AppShell` is a fixed sidebar on
  `lg+` and an off-canvas drawer + sticky top bar on mobile. Every
  list/table scrolls inside its own container — no screen overflows the
  viewport. All visible strings / labels / ARIA names unchanged.
- **Pier date picker** (`b8e9c81`): the pier screen was hardcoded to
  today; added the date control the dashboard and boat setup already have.
- **Pack-stage evidence photos** (`551ea40`, plan
  `docs/superpowers/plans/2026-09-10-pack-stage-photos.md`): migration
  `0009` adds `evidence_photos.stage` (`'pack'` | `'handoff'`, default
  `'handoff'`). `บันทึก + แพ็คเสร็จ` now requires ≥1 pack-stage photo and
  ≥1 box. The pier ship-off gate counts only `stage='handoff'` photos, so
  a pack photo can't satisfy it. `OrderDetail` + `ClaimDetail` split team
  evidence into "รูปตอนแพ็ค" / "รูปตอนส่งขึ้นเรือ"; the customer page
  shows both stages together, ordered by `taken_at`. Migration applied to
  cloud + verified; `photo-upload-url` + `order-view` redeployed;
  `order-view` photo sort live-smoked. 159 tests pass. One implementer
  batch, review Approved, no fix round.

## Deferred to Phase 2 (from the review; none block Phase-1 use)

- RLS `aal2` requirement (2FA is enforced in the UI, not yet in the DB policies).
- Deno unit tests for the four edge functions (currently only curl smoke + a controller run).
- `on delete set null` on `evidence_photos.taken_by` / `claims.resolved_by` / `backorders.fulfilled_by` / `audit_logs.user_id` so team members can be hard-deleted (Phase 1: ban / deactivate instead).
- `resolution_note` column so a manager's internal note isn't part of `claims.description`.
- Responsive `AppShell` (fixed `w-48` sidebar) for the phone-first pier screen.
- Presigned-PUT size cap; edge-fn rate-limit eviction; `cleanup` dead-letter column; shared `useOrder` hook; per-order import audit granularity.
- Pre-existing dev-only `npm audit` advisories (esbuild/vite via vitest@2, react-router 6) — need major bumps.
