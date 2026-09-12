# Plan — Scan a Makro shipping label's QR code to jump straight to an order

Spec: agreed in conversation 2026-09-12 (grilling session, "ยืนยันตามนี้").
Branch: `feature/qr-scan-search` off `main`.

## Context

Every Makro shipping label already carries a QR code. A real label was
photographed and decoded during grilling: the QR encodes **plain text,
exactly the order number** (e.g. `8542107373A`), nothing else — no JSON, no
URL, no extra fields. The team wants a camera icon next to the daily
dashboard's existing search box that opens an in-page live camera preview,
decodes that QR, and jumps straight to the matching order — instead of
typing the number in by hand.

**Known risk, carried over from this app's own history:** `PhotoCapture.tsx`
has a documented, hard-won finding that `<input capture="environment">`
(native OS camera app handoff) silently fails to hand a photo back to the
page on a real device, which is why photo attachment now requires the user
to take the photo with their own camera app first. A live QR scanner uses a
**different** mechanism (`getUserMedia` — an in-page live video stream, no
OS app handoff at all), so that specific failure mode does not apply here,
but it is still a real-camera/real-device feature that cannot be verified
by an automated test suite. The existing text search box is deliberately
left completely untouched, so it always remains a working fallback if the
camera ever misbehaves on a real device — **the controller must live-test
actual camera permission + a real scan on a real phone after this is
deployed**, the same diligence this codebase already applies to camera
features.

## Global Constraints

- Stack unchanged: Vite + React 18 + TS + Tailwind 3, Vitest. Supabase
  cloud (`kprlqjxwolljkgqyzygf`). **No DB migration, no edge function** —
  this reads the existing `orders.makro_order_no` column client-side.
- New dependency: `html5-qrcode` (npm). Pin an exact version in
  `package.json`, same convention as this project's other pinned deps.
  Do not add any other scanning/camera library.
- **Scope: `DailyDashboard.tsx` only.** Do not add this to `PierLoad.tsx`
  or anywhere else — it does not have a comparable search box today.
- UI: a small camera-icon button placed directly beside the existing
  `<input placeholder="ค้นหาชื่อลูกค้า / เลขออเดอร์" ...>` search box.
  Clicking it renders the live camera preview **inline in the page**
  (this codebase has no modal/dialog component anywhere — grepped, zero
  matches — do not introduce one; render the scanner as a normal section
  that appears/disappears, matching how every other conditional UI in
  this codebase already works, e.g. `PierLoad`'s picker vs. per-order
  screens). Include a visible "ปิด"/"ยกเลิก" button that stops the camera
  stream and hides the section.
- **On successful decode:** query `orders` for an exact match on
  `makro_order_no` against the decoded text (trimmed) — **not** scoped to
  the dashboard's currently-selected `date`; search across all orders,
  since the whole point is not having to know/select the right date
  first.
  - Exactly one match → stop the camera stream, navigate to
    `/order/<id>`.
  - Zero matches → show a Thai message inline in the scanner section
    (e.g. "ไม่พบออเดอร์นี้ในระบบ ลองสแกนใหม่ หรือปิดแล้วพิมพ์ค้นหาแทน")
    and keep the camera running so the user can try again without
    reopening it.
  - More than one match (the DB's unique constraint is
    `unique(ship_day_id, makro_order_no)`, not globally unique, so this
    is possible in principle even though real Makro order numbers are
    practically always unique) → do not guess; show the short list of
    matches (order number already known, so show each match's
    `customer_name_en` + `ship_date` as a pickable line) instead of
    picking one arbitrarily.
- **Do not touch the existing search input or its filtering logic at
  all** — it must keep working exactly as today, unmodified, as the
  built-in fallback if the camera scanner has any issue on a real
  device.
- Camera permission: if the browser denies/errors on camera access,
  show a plain Thai error in the scanner section (not a crash, not a
  silent no-op) and leave the existing search box usable as-is.
- All existing tests must stay green. The camera itself cannot be
  meaningfully exercised by jsdom/vitest — test the surrounding logic
  (the lookup-and-navigate function, the zero/one/many-match branches,
  the button rendering/toggle) with the camera library itself mocked;
  do not attempt to fake real camera hardware in tests.

## Task 1 (single batch)

### 1a. `koh-payam-delivery/package.json`

Add `html5-qrcode` to `dependencies` at its latest stable exact version
(check npm for the current latest 2.x release and pin that exact string,
matching this project's existing pinned-version convention). Run the
project's package manager to update the lockfile.

### 1b. `koh-payam-delivery/src/lib/api/orders.ts`

New `export async function findOrdersByMakroOrderNo(orderNo: string)` —
queries `orders` for `select('id,customer_name_en,ship_date').eq('makro_order_no', orderNo.trim())`
(no `ship_date` filter — searches everything the current user can read
under RLS, which for a team member is all orders per the existing
`team_read` policy). Throw the file's usual Thai error convention on a
real Supabase error; on success return the array as-is (empty, one, or
multiple rows — the caller decides what to do with each case, per the
Global Constraints above).

Test (`orders.test.ts`): a query for a known order number returns the
mocked row(s); an empty result returns `[]` (not an error, not a throw).

### 1c. New component `koh-payam-delivery/src/components/QrOrderScanner.tsx`

- Props: `onFound: (order: { id: string; customer_name_en: string; ship_date: string }) => void`
  (called only in the exactly-one-match case; the multi-match case is
  handled inside this component, not delegated to the parent) and
  `onClose: () => void`.
- Wraps `html5-qrcode`'s scanner API to render a live camera preview
  into a container element on mount, and tears it down (stops the
  camera stream) on unmount and whenever the "ปิด" button is pressed
  (calling `onClose` after).
- On every decoded value: call `findOrdersByMakroOrderNo` with the
  decoded text. Zero matches → show the retry message described above,
  keep scanning. Exactly one → stop the camera, call `onFound` with
  that row. More than one → stop the camera, render the pickable list
  described above; picking one calls `onFound` with that row (re-derive
  its `id` from the list you already fetched — do not re-query).
- Camera permission/hardware errors from the library surface as a Thai
  message in this component, without crashing the page.
- Read `PhotoCapture.tsx` in full before writing this — not because the
  capture mechanism is the same (it isn't — this is `getUserMedia`, not
  `<input capture>`), but to match this codebase's established style for
  a camera-adjacent component: a small, self-contained component owning
  its own busy/error state, Thai copy, no external UI framework.
- Test (`QrOrderScanner.test.tsx`): mock `html5-qrcode`'s module entirely
  (do not attempt to simulate real camera hardware). Cases: a decode
  that resolves to exactly one order calls `onFound` with it; a decode
  that resolves to zero orders shows the retry message and does not
  call `onFound`; a decode that resolves to multiple orders renders a
  pickable list, and clicking one entry calls `onFound` with the right
  one; pressing the close button calls `onClose`.

### 1d. `koh-payam-delivery/src/routes/team/DailyDashboard.tsx`

Read the whole file first (it already has the `q`/search-input section
right above the orders table).

- New state: whether the scanner section is open.
- A small camera-icon button next to the existing search `<input>` (same
  row — your call on exact layout, e.g. a small icon button immediately
  after the input, or an inline-flex wrapper around both — but do not
  restructure or rename the existing input or its `onChange`/`value`
  wiring).
- When open, render `<QrOrderScanner>` (from 1c) somewhere sensible
  right below the search row; `onFound` navigates to `/order/<id>` via
  this file's existing `useNavigate`/`Link`-from-`react-router-dom`
  import (check whether `useNavigate` is already imported — if not, add
  it to the existing `react-router-dom` import line) and closes the
  scanner section; `onClose` just closes the section.
- Test (`DailyDashboard.test.tsx` if it exists, else add coverage
  wherever this route's tests live): the camera button toggles the
  scanner section open/closed; a mocked `onFound` call navigates to the
  right `/order/<id>`.

### 1e. Tests

Full list run at the end: `orders.test.ts`, `QrOrderScanner.test.tsx`,
`DailyDashboard.test.tsx` (or wherever coverage lands). No Deno/edge
function involvement. No migration.

Report: `.superpowers/sdd/2026-09-12-qr-scan-search/task-1-report.md`.
