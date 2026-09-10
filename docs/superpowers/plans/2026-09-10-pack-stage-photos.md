# Plan — Pack-stage evidence photos

Spec: agreed in conversation 2026-09-10 (grilling session, "ยืนยันตามนี้").
Branch: `feature/pack-photos` off `main` (@ b8e9c81).

## Context

Phase-1 app + Makro rework + UI polish are all shipped on `main`. Evidence
photos today are captured only on the pier screen (`PierLoad`), stored flat in
`evidence_photos (id, order_id, r2_key, note, taken_by, taken_at)`. The pier
"ship-off" gate and `OrderDetail`'s status-advance gate both check
`evidence_photos.length >= 1` (any photo). `order-view` sends every
`evidence_photos` row to the customer page as "รูปการจัดส่ง / Delivery photos".
`ClaimDetail` shows every `evidence_photos` row of the order as team evidence.

This feature adds photo capture at the **pack** step and introduces a
`stage` discriminator so the pier gate keeps requiring a genuine handoff photo.

## Global Constraints

- Stack unchanged: Vite + React 18 + TS + Tailwind 3, Vitest. Supabase cloud
  project `kprlqjxwolljkgqyzygf` (no local Docker/Deno — migration via
  `supabase db push`, edge fns via `supabase functions deploy`, both run by
  the controller).
- Team UI is Thai. All existing visible strings, form labels, and ARIA/role
  names must stay byte-identical unless a task says otherwise (153 tests lock
  them).
- `evidence_photos.stage`: `text not null default 'handoff'`, check constraint
  `stage in ('pack','handoff')`. Existing rows → `'handoff'`.
- **Pier ship-off gate** (advance to `at_pier` / `shipped`, in `OrderDetail`
  and `PierLoad`): count ONLY `stage = 'handoff'` photos. A pack photo must
  never satisfy it.
- **Pack "finish" gate** (`บันทึก + แพ็คเสร็จ` in `PackOrder`): enabled only
  when `pack`-stage photos for the order ≥ 1 AND `paper_box_count +
  foam_box_count >= 1`. Plain `บันทึก` stays ungated.
- Pack photos: no per-order count limit.
- Customer page (`/o/:token`): shows BOTH stages together under the existing
  "รูปการจัดส่ง / Delivery photos" heading, ordered by `taken_at` ascending.
  No stage split, no new strings.
- `OrderDetail` + `ClaimDetail` (team): split team evidence into two blocks —
  "รูปตอนแพ็ค" and "รูปตอนส่งขึ้นเรือ".
- No backfill. Rule applies to orders packed after deploy; historical rows
  stay `'handoff'`.
- Photo upload path/auth unchanged: `photo-upload-url` `scope:'evidence'`
  (team session), `PhotoCapture` compresses + presigned R2 PUT + records the
  row. `stage` rides along as a new optional field, default `'handoff'`.

## Task 1 (single batch — one implementer)

All of the following in one branch, committed in logical chunks. Run
`npx vitest run` and `npm run build` green before reporting.

### 1a. Migration `koh-payam-delivery/supabase/migrations/0009_pack_stage_photos.sql`

```sql
alter table evidence_photos
  add column if not exists stage text not null default 'handoff';
alter table evidence_photos
  drop constraint if exists evidence_photos_stage_check;
alter table evidence_photos
  add constraint evidence_photos_stage_check check (stage in ('pack','handoff'));
```

Controller applies to cloud with `supabase db push` after the task review.

### 1b. `koh-payam-delivery/supabase/functions/photo-upload-url/index.ts`

- `scope:'evidence'` request body gains optional `stage`. Accept only
  `'pack'` | `'handoff'`; anything else (including absent) → `'handoff'`.
- Keep the R2 folder as `evidence/${orderId}/…` for both stages (the column
  is the source of truth; do not split folders).
- Response shape unchanged. Auth unchanged.
- Controller redeploys after the task review.

### 1c. `koh-payam-delivery/src/lib/api/photos.ts`

- `RequestUploadUrlArgs` evidence variant gains `stage?: 'pack' | 'handoff'`;
  forward it in the POST body.
- `attachEvidencePhoto(orderId, key, opts?: { stage?: 'pack' | 'handoff'; note?: string })`
  — write `stage` (default `'handoff'`) into the insert. Keep the existing
  positional `note` working OR migrate callers; prefer the options object and
  update both call sites (PierLoad, CustomerClaimForm uses `scope:'claim'` so
  not affected). Keep the thrown Thai error messages.

### 1d. `koh-payam-delivery/src/components/PhotoCapture.tsx`

- New optional prop `stage?: 'pack' | 'handoff'` (default `'handoff'`), passed
  to `requestUploadUrl` and `attachEvidencePhoto`… but note `PhotoCapture`
  currently calls `requestUploadUrl` directly and the parent calls
  `attachEvidencePhoto` in `onUploaded`. So: pass `stage` into
  `requestUploadUrl` args here; the parent keeps calling `attachEvidencePhoto`
  with the stage it owns. Do NOT move the DB insert into PhotoCapture.
- New optional prop to lift the cap: when `max` is omitted or `Infinity`,
  never disable the input for "at max" and show `{keys.length} รูป` instead of
  `{keys.length} / {max} รูป`. Keep `max` working when a finite number is
  passed (pier still passes `max={3}`).

### 1e. `koh-payam-delivery/src/routes/team/PackOrder.tsx`

- Add a "รูปหลักฐานตอนแพ็ค" section using `PhotoCapture` with
  `scope="evidence"`, `stage="pack"`, `orderId={id}`, no `max`.
- On each upload, call `attachEvidencePhoto(id, key, { stage: 'pack' })` and
  bump a local `packPhotoCount` (mirror PierLoad's pattern).
- Also seed `packPhotoCount` from the loaded order's existing pack-stage
  photos so a revisit isn't forced to re-shoot. `getOrder` returns
  `evidence_photos(*)` already — filter `stage === 'pack'`.
- Gate: `บันทึก + แพ็คเสร็จ` button `disabled` unless
  `packPhotoCount >= 1 && paper + foam >= 1` (in addition to `busy`).
  When blocked, show a Thai hint line (e.g.
  `ต้องถ่ายรูปลังที่แพ็คเสร็จอย่างน้อย 1 รูป และกรอกจำนวนลังอย่างน้อย 1 ลัง`).
- Plain `บันทึก` stays enabled (only `busy` disables it).
- Keep every existing string/label/button name. `getByLabelText(/ลังกระดาษ/)`,
  buttons `บันทึก` and `บันทึก + แพ็คเสร็จ`, table text must all still resolve.

### 1f. `koh-payam-delivery/src/routes/team/PierLoad.tsx`

- The evidence `PhotoCapture` stays `max={3}`; its `onUploaded` calls
  `attachEvidencePhoto(sel.id, key, { stage: 'handoff' })`.
- No visible change. Keep button name `ส่งขึ้นเรือแล้ว` and the
  boat + `photoCount >= 1` gate (photoCount already only counts this screen's
  uploads, which are now explicitly handoff).

### 1g. `koh-payam-delivery/src/routes/team/OrderDetail.tsx`

- `photos = order.evidence_photos ?? []` → split:
  `packPhotos = photos.filter(p => p.stage === 'pack')`,
  `handoffPhotos = photos.filter(p => p.stage !== 'pack')`.
- Pier gate: `pierBlocked` uses `handoffPhotos.length >= 1` (was
  `photos.length >= 1`).
- Replace the single "รูปหลักฐาน" block with two: "รูปตอนแพ็ค" (packPhotos)
  and "รูปตอนส่งขึ้นเรือ" (handoffPhotos), each with its own empty state
  ("ไม่มีรูป"). Same thumbnail styling.

### 1h. `koh-payam-delivery/src/routes/team/ClaimDetail.tsx`

- The team-evidence query currently selects `r2_key` only; add `stage`.
- Split the single "รูปหลักฐานของทีม" block into "รูปตอนแพ็ค" and
  "รูปตอนส่งขึ้นเรือ" from `evi` (which becomes `{url, stage}[]`). Keep the
  customer-photos block ("รูปจากลูกค้า") unchanged.

### 1i. `koh-payam-delivery/supabase/functions/order-view/index.ts`

- The `evidence_photos(r2_key)` sub-select → `evidence_photos(r2_key,taken_at)`
  and sort the mapped `evidencePhotos` by `taken_at` ascending before mapping
  to URLs. No stage filtering — customer sees both. Response key unchanged.
- Controller redeploys after review.

### 1j. Tests

- Update `PackOrder.test.tsx`: mock `attachEvidencePhoto`; assert
  `บันทึก + แพ็คเสร็จ` is disabled with no pack photo / zero boxes and enabled
  once both are satisfied (drive the `PhotoCapture` mock like `PierLoad.test`
  drives `mock-upload`). Keep existing assertions.
- Update `PierLoad.test.tsx`: `attachEvidencePhoto` mock now receives
  `('o1', 'evidence/o1/key-1.jpg', { stage: 'handoff' })` — adjust the
  `toHaveBeenCalledWith`.
- Update `OrderDetail.test.tsx`: order-detail mock `evidence_photos` rows gain
  `stage`; the existing "เปลี่ยนเป็น ถึงท่าเรือ" gate tests must still pass
  (give the fixture a `stage:'handoff'` photo where they expect the gate open,
  none where they expect it blocked). Add one assertion that a `stage:'pack'`
  photo alone does NOT open the gate.
- Update `ClaimDetail.test.tsx`: evidence_photos mock rows gain `stage`; keep
  existing assertions green.
- Add/extend a `photos.ts` unit test if one exists for `attachEvidencePhoto`
  (assert the `stage` field in the insert payload).
- `order-view` is Deno, not in vitest — controller smokes it live.

Report: `.superpowers/sdd/2026-09-10-pack-stage-photos/task-1-report.md`.
