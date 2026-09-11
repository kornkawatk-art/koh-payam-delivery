# Plan — จำนวนชิ้น (loose-piece count) alongside box counts

Spec: agreed in conversation 2026-09-11 (two AskUserQuestion rounds, both
confirmed/expanded the recommendations).
Branch: `feature/piece-count` off `main` (@ 5a81a7e — check `git log -1` at
dispatch time for the exact current head).

## Context

Some products don't fit in a paper or foam box (e.g. a single large item) and
are shipped loose, counted by the piece. The pack screen only has
"ลังกระดาษ"/"ลังโฟม" today. Add a third count, "ชิ้น", alongside them
everywhere box counts appear, plus a computed total (paper + foam + piece)
on the team-facing screens. Loose pieces get the same physical numbered
label treatment as boxes on the print worksheet (per user: "ต้องมีเลขกำกับ
เหมือนลัง").

## Global Constraints

- Stack unchanged: Vite + React 18 + TS + Tailwind 3, Vitest. Supabase cloud
  (`kprlqjxwolljkgqyzygf`) — controller applies the migration after review;
  no edge function needs redeploying for the team-only fields, but
  `order-view` DOES need a small addition + redeploy (customer page shows
  the piece count) — see 1g.
- `piece_count` is a **team-entered field**, never derived from the Makro
  import (mirrors `paper_box_count`/`foam_box_count` exactly — not part of
  `ParsedOrder`, not written by `commitImport`, DB `default 0` covers new
  orders).
- Total (paper + foam + piece) shown on: หน้าแพ็ค (PackOrder), หน้า
  รายละเอียดออเดอร์ (OrderDetail), หน้าท่าเรือ (PierLoad) and แดชบอร์ดรายวัน
  (DailyDashboard). **NOT** shown on the customer page — the customer page
  gets the piece *count* alongside the existing paper/foam counts (matching
  how it already shows both of those), but no combined "total" line.
- Number inputs (ลังกระดาษ / ลังโฟม / ชิ้น, all three, on PackOrder) keep
  showing `0` as before — do NOT switch to a blank/empty default. Instead,
  focusing the field selects its entire contents (`onFocus` → `select()`) so
  typing immediately replaces the "0" instead of requiring a manual
  backspace first.
- All existing tests must stay green.

## Task 1 (single batch)

### 1a. Migration `koh-payam-delivery/supabase/migrations/0012_piece_count.sql`

```sql
alter table orders
  add column if not exists piece_count int not null default 0
    check (piece_count >= 0);
```

Controller applies to cloud (`supabase db push`) after the task review.

### 1b. `koh-payam-delivery/src/lib/api/pack.ts`

- `PackInput` gains `pieceCount: number`.
- `savePack` writes `piece_count: input.pieceCount` in the same `.update(...)`
  call that already writes `paper_box_count`/`foam_box_count` — one write,
  same as today (do not split into two calls).
- `logAction('pack_saved', ...)` metadata gains `pieceCount`.
- `pack.test.ts`: update the call to `savePack({orderId, paperCount,
  foamCount, pieceCount})` and the asserted `update` patch to include
  `piece_count`. Keep the "exactly one write, no order_items touch, no
  status gate" assertions intact.

### 1c. `koh-payam-delivery/src/routes/team/PackOrder.tsx`

- Add a third `<label className="field">` for "จำนวนชิ้น" next to the
  existing ลังกระดาษ/ลังโฟม inputs (same `type="number" min={0}` pattern,
  same `w-24` sizing).
- **All three** number inputs (paper, foam, piece) gain
  `onFocus={(e) => e.target.select()}` — clicking/tapping into a field
  selects its current value (starts as `0`) so typing replaces it
  immediately. Do not change the `value={0}` default itself.
- Add a computed, read-only total line below the three inputs:
  `ลังกระดาษ {paper} · ลังโฟม {foam} · ชิ้น {piece} · รวม {paper+foam+piece}`
  (exact Thai wording — this becomes the pattern OrderDetail/PierLoad/
  DailyDashboard reuse conceptually, though their layouts differ).
- `save()` passes `pieceCount: piece` to `savePack`.
- Seed `piece` state from `o.piece_count` on load (mirrors `paper`/`foam`).
- Tests (`PackOrder.test.tsx`): a new test types into all three fields and
  asserts `savePack` was called with the right `pieceCount`; a test that
  focusing a field with value `0` selects it (can be tested via
  `userEvent.click` + checking `document.activeElement` selection, or by
  asserting the field's value is fully replaced after `userEvent.type`
  without a preceding clear — pick whichever is reliably testable with
  Testing Library/jsdom, note if jsdom's `HTMLInputElement.select()` needs
  a workaround). Existing "บันทึก" test's `savePack` assertion needs
  `pieceCount: 0` added (default, since the field isn't touched in that
  test) — update it rather than leaving it failing.

### 1d. `koh-payam-delivery/src/routes/team/OrderDetail.tsx`

- Add a new line (there is currently NO box-count display on this page at
  all) showing the same summary format as PackOrder's total line:
  `ลังกระดาษ {paper_box_count} · ลังโฟม {foam_box_count} · ชิ้น
  {piece_count} · รวม {total}` — place it near "ส่งที่: {sub_district}"
  (same `muted` paragraph style, own line).
- `getOrder` already `select('*')` — `order.piece_count` is available with
  no query change.
- Test: assert the new line renders with the right numbers from a fixture
  that includes `piece_count`.

### 1e. `koh-payam-delivery/src/lib/api/shipDays.ts`

- `listOrdersForDay`'s `.select(...)` string gains `piece_count`. Update
  `shipDays.test.ts`'s pinned select-string assertion.

### 1f. `koh-payam-delivery/src/routes/team/PierLoad.tsx` + `DailyDashboard.tsx`

- `PierOrder` type (PierLoad) gains `piece_count: number`.
- Both places that currently compute `paper_box_count + foam_box_count` and
  label it "ลัง" — the order-list badge in `PierLoad.tsx` and the "ลัง"
  column in `DailyDashboard.tsx` — change the sum to `paper_box_count +
  foam_box_count + piece_count`, and rename the label from "ลัง" to "รวม"
  in both places (it's no longer only boxes). `PierLoad`'s badge becomes
  `{total} รวม`; `DailyDashboard`'s column header becomes "รวม" instead of
  "ลัง", same `tnum` cell.
- Tests: update both files' existing box-count assertions to account for
  `piece_count` in fixtures (add `piece_count: 0` to existing fixtures
  where absent so old assertions keep their old totals) and add one new
  test per file proving a nonzero `piece_count` is included in the total.

### 1g. `koh-payam-delivery/supabase/functions/order-view/index.ts` + `koh-payam-delivery/src/routes/customer/CustomerOrderView.tsx` + `i18n.ts`

- `order-view`: response gains `pieceCount: o.piece_count` (plain number,
  always present — unlike `outstandingAmount` this is never null, DB
  defaults it to `0`). Add it near `paperBoxCount`/`foamBoxCount` in the
  response object.
- `CustomerOrderView.tsx`: `OrderView` type gains `pieceCount: number`. In
  the existing boxes/boat section (`{t('boxes')}: {t('paper')}
  {paperBoxCount} · {t('foam')} {foamBoxCount}`), append `· {t('pieces')}
  {pieceCount}` — same line, same section, no new section, no total shown
  here (customer page intentionally excluded from the "total" requirement).
- `i18n.ts`: new key `pieces` — en `"Pieces"`, th `"ชิ้น"` — both languages
  (parity auto-tested).
- Controller redeploys `order-view` after review and live-smokes it
  (confirm `pieceCount` comes through as a number, defaults to `0` for an
  order that never had it set).

### 1h. `koh-payam-delivery/src/routes/team/LabelSheet.tsx`

- Add a third numbered block, mirroring the existing paper/foam blocks
  exactly (same `seqLines()` helper, same chip rendering, same "—" empty
  state): heading `เขียนหน้าลัง · ชิ้น ({piece})`, sequence chips `1/N, 2/N,
  ...` via the same `seqLines(piece)` call already used for paper/foam.
  `order.piece_count` is available via the existing `getOrder` call — no
  query change.
- Test (`LabelSheet.test.tsx`): assert the piece sequence chips render
  (e.g. a fixture with `piece_count: 2` shows "1/2" and "2/2" alongside the
  existing paper/foam assertions).

### 1i. Tests

Full list run at the end: `pack.test.ts`, `PackOrder.test.tsx`,
`OrderDetail.test.tsx`, `shipDays.test.ts`, `PierLoad.test.tsx`,
`DailyDashboard.test.tsx`, `CustomerOrderView.test.tsx`, `i18n.test.ts`
(parity, automatic), `LabelSheet.test.tsx`. `order-view/index.ts` is Deno,
not in vitest — controller live-smokes it per 1g.

Report: `.superpowers/sdd/2026-09-11-piece-count/task-1-report.md`.
