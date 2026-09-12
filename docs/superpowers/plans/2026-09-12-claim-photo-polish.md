# Plan — Claim qty cap, damaged multi-select, qty-input fix, red payment highlight, zoomable photos

Spec: five small/medium fixes from the same conversation, confirmed with
"ทำงานต่อได้เลย" (no further grilling requested for this batch — each item
was investigated against the real current code before this plan was
written, and grounded in the app's own established patterns rather than
left ambiguous).

Branch: `feature/claim-photo-polish` off `main`.

## Context

Five independent-but-related fixes, bundled into one branch since most
touch the same claim-form area:

1. A customer claiming `missing_in_box` or `damaged` must not be able to
   enter a quantity greater than what was actually shipped for that item.
2. `damaged` currently allows selecting exactly one product (a single
   `<select>`); the team wants it to allow multiple products at once,
   same as `missing_in_box` already does.
3. The qty input's existing `onFocus={(e) => e.target.select()}` fix (from
   the earlier claim-multi-item feature) isn't reliably working on real
   phones — the default `1` still can't always be typed over without
   deleting first. This needs a more robust fix than a bare synchronous
   `.select()` call, which is a known-flaky pattern on mobile browsers
   with `type="number"` inputs.
4. The "เก็บเงินปลายทาง" (cash-on-delivery amount due) banner on
   `OrderDetail.tsx` and `PierLoad.tsx` uses the app's yellow `alert-warn`
   style — the team wants it more visually prominent (red).
5. Team-side evidence photos (pack photos + pier/boat-loading photos, on
   both `OrderDetail.tsx` and `ClaimDetail.tsx`, plus `ClaimDetail.tsx`'s
   customer-submitted claim photos for consistency — all five thumbnail
   spots use the identical small `h-24 w-24` style today) currently have
   no way to see them larger — tapping does nothing.

## Global Constraints

- Stack unchanged: Vite + React 18 + TS + Tailwind 3, Vitest, Deno edge
  functions. Supabase cloud (`kprlqjxwolljkgqyzygf`) — no DB migration.
  `submit-claim` edge function needs one change (item 1's server-side
  cap) — controller redeploys it after review.
- Item 1 — **qty cap at shipped quantity, both layers**:
  - Client (`CustomerClaimForm.tsx`): `order-view`'s response already
    includes `shippedQty` per item (`supabase/functions/order-view/index.ts`
    — read it, the field is already there, just not yet threaded through
    this component's prop type). Widen `CustomerClaimForm`'s `items` prop
    type to include `shippedQty: number`, and **filter out any item with
    `shippedQty === 0`** from both the `damaged` `<select>`'s options and
    the multi-select checklist (item 2) entirely — an item that shipped
    zero units can't sensibly be claimed as "missing from the box" or
    "damaged in the box" (that case is already the existing shortage/
    backorder flow, a different concept — do not conflate them). For
    every remaining item, cap its qty input's HTML `max` at that item's
    `shippedQty`, and clamp the JS state update the same way the
    existing `Math.max(1, ...)` floor already works
    (`Math.min(shippedQty, Math.max(1, Math.floor(Number(e.target.value)) || 1))`).
  - Server (`submit-claim/index.ts`): read the whole file first. The
    existing `order_items` fetch (`select('id,line_no')`, used to resolve
    each `orderItemIndex`) must also select `qty_shipped`; when building
    `itemsJson`, clamp each entry's `qty` to
    `Math.min(submittedQty, resolvedItem.qty_shipped || 1)` — this is
    defense-in-depth against a client that bypasses the UI cap (a
    modified request), mirroring this codebase's established
    clamp-don't-reject convention for qty values, not a new pattern.
- Item 2 — **`damaged` becomes multi-select like `missing_in_box`**:
  - `CustomerClaimForm.tsx`: the two claim types' item-selection UI
    becomes identical — combine the render condition (currently
    `type === 'missing_in_box'`) to cover both types, remove the old
    `damaged`-only single-`<select>` + single-qty blocks entirely. The
    shared checked-items state (currently `missingItems`) is reused for
    both types — **reset it to empty when the claim type changes**
    (switching between "ของขาดในกล่อง" and "สินค้าเสียหาย" should not
    carry over a stale selection from the other type). `canSubmit`'s
    condition (`type !== 'missing_in_box' || missingCount > 0`) must
    become `type !== 'box_lost' && missingCount === 0` is false → i.e.
    both `missing_in_box` and `damaged` now require at least one checked
    item, only `box_lost` doesn't.
  - The section legend text (`claim_form_missing_items`, currently
    "สินค้าที่ขาดมีรายการใดบ้าง" / "Which items are missing?") is
    specific to "missing" — it must read differently for `damaged` (e.g.
    "สินค้าที่เสียหายมีรายการใดบ้าง" / "Which items are damaged?"). Add
    a second i18n key pair for this (both `en`/`th` blocks in
    `src/routes/customer/i18n.ts` — this file has an existing parity
    test, keep it passing) and pick the legend text based on `type` in
    the component.
  - `submit-claim/index.ts`: `ITEMS_COUNT_OK`'s `damaged: (n) => n === 1`
    becomes `damaged: (n) => n >= 1` — identical rule to
    `missing_in_box` now. `box_lost` stays `(n) => n === 0`, unchanged.
- Item 3 — **qty input select-on-focus, more robust**:
  - The current `onFocus={(e) => e.target.select()}` is a known-flaky
    pattern on mobile browsers for `type="number"` inputs — some mobile
    keyboards/browsers don't apply the selection visually or
    functionally when `.select()` is called synchronously inside the
    focus handler. Fix: defer the `.select()` call to the next tick
    (`requestAnimationFrame` or a `setTimeout(..., 0)` — pick whichever
    this codebase's existing conventions would favor, there's no
    precedent either way in this file, so use your judgment but explain
    the choice in your report) so it runs after the native focus/
    keyboard-open sequence has settled. Apply this fix to **every**
    numeric qty input in `CustomerClaimForm.tsx` (there will be exactly
    one shared input pattern after item 2 merges the two item-selection
    branches). This is a real behavioral fix, not just a refactor —
    write a test that actually exercises focus-then-immediate-typing in
    a way that would have failed against the old synchronous-only
    version if practical, or at minimum a test proving the select-all
    behavior still fires (mock timers if you use `setTimeout`).
- Item 4 — **red highlight for the COD-amount banner**:
  - `OrderDetail.tsx` and `PierLoad.tsx`: the "เก็บเงินปลายทาง ฿X
    (วิธีชำระเงิน)" banner's class changes from `alert-warn` to
    `alert-danger` (both classes already exist in `src/index.css` —
    reuse them, don't invent a new class). Scope is exactly these two
    banners — do not touch `DailyDashboard.tsx`'s small "เก็บเงิน" queue
    badge (a different, unrelated indicator that doesn't show the
    amount itself).
- Item 5 — **zoomable team photos**:
  - New shared component `src/components/ui/ZoomableImage.tsx` — wraps
    the existing thumbnail `<img>` pattern (`h-24 w-24 rounded-lg border
    border-line object-cover`, already identical across all 5 spots) in
    a clickable element; clicking opens a full-screen overlay showing
    the image at a larger size (`max-h-[90vh] max-w-[90vw]` or similar,
    `object-contain`), dismissed by clicking the overlay/backdrop or a
    close button. No external library — plain fixed-position `<div>` +
    `useState`, matching this codebase's established "no external UI
    framework" convention (this app has zero modal/dialog components
    today — this is the first one; keep it small and self-contained,
    not a general-purpose modal system).
  - Apply it to replace the plain `<img>` in **all five** existing
    thumbnail spots: `OrderDetail.tsx`'s "รูปตอนแพ็ค" and "รูปตอนส่งขึ้น
    เรือ" sections, and `ClaimDetail.tsx`'s "รูปจากลูกค้า", "รูปตอนแพ็ค",
    and "รูปตอนส่งขึ้นเรือ" sections. Keep each section's existing empty-
    state ("ไม่มีรูป") and grid layout untouched — only the individual
    `<img>` element becomes the new component.
  - Do **not** touch `CustomerOrderView.tsx`'s photo display or
    `PierLoad.tsx`'s own in-progress upload-preview thumbnails (inside
    `PhotoCapture.tsx`) — out of scope; this item is specifically about
    team members reviewing already-uploaded photos later, not the
    customer view or the transient "just captured, about to upload"
    preview.
- All existing tests must stay green.

## Task 1 (single batch)

### 1a. `koh-payam-delivery/supabase/functions/order-view/index.ts` — no change expected

Read it to confirm `shippedQty` is already present in the `items` mapping
(it is, per the plan's research — `shippedQty: Number(i.qty_shipped)`).
If it's somehow missing by the time you read the live file, add it; this
subtask exists only to have you verify the assumption, not to blindly
skip it.

### 1b. `koh-payam-delivery/src/routes/customer/CustomerClaimForm.tsx` (+ `.test.tsx`)

Read the whole file first (both the current code and its test file).
Implements items 1, 2, and 3 from the Global Constraints:

- Widen the `items` prop type to `{ productName: string; shippedQty: number }[]`.
- Filter `shippedQty > 0` items for both `damaged`-was/`missing_in_box`
  selection contexts (post-merge, this is one filtered list used by the
  single combined checklist UI).
- Merge the `damaged`/`missing_in_box` item-selection branches into one,
  gated on `type === 'missing_in_box' || type === 'damaged'`, using a
  legend that switches text based on `type` (new i18n keys, see 1c).
  Reset the checked-items state on type change.
- Cap each qty input's `max` + JS clamp at that item's `shippedQty`.
- Fix the `onFocus` select-on-focus pattern per item 3's exact
  instruction.
- Update `canSubmit` per the Global Constraints' exact new rule.

Tests: update the existing fixture's items to include `shippedQty`;
add cases for — a qty input cannot be typed/clamped above its item's
`shippedQty`; a `shippedQty === 0` item never appears in either type's
selectable list; `damaged` now renders the same checkbox-list UI as
`missing_in_box` and requires at least one checked item before submit;
switching claim type clears the previous selection; the qty-input
select-on-focus fix still results in the existing text being selected
(adapt however the deferred-call mechanism requires — fake timers if
`setTimeout`, or whatever `requestAnimationFrame` needs in this test
environment).

### 1c. `koh-payam-delivery/src/routes/customer/i18n.ts` (+ parity check)

Add the new legend key pair for the `damaged` multi-select section (see
Global Constraints item 2 for suggested wording) to both `en` and `th`
blocks. Run/check the existing parity test still passes.

### 1d. `koh-payam-delivery/supabase/functions/submit-claim/index.ts`

Read the whole file first. Two changes:

- `ITEMS_COUNT_OK.damaged` → `(n) => n >= 1`.
- The `order_items` fetch used to resolve `orderItemIndex` values also
  selects `qty_shipped`; when building `itemsJson`, clamp each entry's
  `qty` per the Global Constraints' exact formula.

No Deno test harness exists in this repo (per this session's established
convention) — none added here either; careful review substitutes.

### 1e. `koh-payam-delivery/src/routes/team/OrderDetail.tsx`

- Item 4: the COD-amount banner's class → `alert-danger`.
- Item 5: replace the "รูปตอนแพ็ค"/"รูปตอนส่งขึ้นเรือ" sections'
  `<img>` elements with the new `ZoomableImage` (1f).

### 1f. New `koh-payam-delivery/src/components/ui/ZoomableImage.tsx` (+ `.test.tsx`)

Read `koh-payam-delivery/src/components/ui/Spinner.tsx` or another small
existing `ui/` component first for this codebase's established style for
a small, self-contained component. Props: at minimum `src: string`,
`alt: string`, and whatever thumbnail-sizing class the 5 call sites
already share (either hardcode the existing `h-24 w-24 rounded-lg
border border-line object-cover` inside the component since it's
identical everywhere today, or accept a `className` override — your
call, but if every call site would pass the exact same value, hardcoding
it is simpler and matches this codebase's low-abstraction preference).

Tests: renders a thumbnail; clicking it shows the enlarged overlay;
clicking the overlay (or a close control) dismisses it.

### 1g. `koh-payam-delivery/src/routes/team/ClaimDetail.tsx`

- Item 5: replace all three photo sections' (`รูปจากลูกค้า`, `รูปตอนแพ็ค`,
  `รูปตอนส่งขึ้นเรือ`) `<img>` elements with `ZoomableImage`.

### 1h. `koh-payam-delivery/src/routes/team/PierLoad.tsx`

- Item 4 only: the COD-amount banner's class → `alert-danger`. (This
  file's own photo-capture UI is out of scope for item 5, per Global
  Constraints.)

### 1i. Tests

Full list run at the end: `CustomerClaimForm.test.tsx`, `i18n.test.ts`,
`ZoomableImage.test.tsx` (new), `OrderDetail.test.tsx`,
`ClaimDetail.test.tsx`, `PierLoad.test.tsx` (if it asserts the banner's
class — check). No migration, no Docker/Deno test harness added.

Report: `.superpowers/sdd/2026-09-12-claim-photo-polish/task-1-report.md`.
