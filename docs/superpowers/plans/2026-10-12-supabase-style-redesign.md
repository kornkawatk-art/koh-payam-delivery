# Supabase-style redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole app to the approved Supabase-like look and add a dark mode for team pages.

**Architecture:** Colours move to CSS variables (RGB channels) that Tailwind reads through `rgb(var(--c-x) / <alpha-value>)`; dark mode redefines the variables under `html[data-theme='dark']`, which only `AppShell` sets. Component classes in `src/index.css` carry most of the look; a small sweep fixes literal colours.

**Tech Stack:** Vite + React 18 + TS + Tailwind 3 + Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-supabase-style-redesign.md`

## Global Constraints

- Light is the default; the OS dark setting is ignored; the device remembers the choice in `localStorage['theme']`.
- Dark mode only inside `AppShell`; login, 2FA, `/o/...`, `/help`, `/liff/...` are always light.
- Keep our gold brand; green stays "done"; status colours keep their meaning.
- Buttons ≥ 44px on touch screens. No tablet layout. Stickers print black on white.
- Never Playwright. Visual checks only via Edge headless screenshots of pages that render without login, or by the user after deploy.

## Review Focus

1. A component left with a literal colour that is unreadable in dark mode (`text-white` on a light fill, `bg-white` cards, hex in TSX).
2. A sticker printed while dark mode is on must be black on white.
3. A device left in dark mode opening a customer link (`/o/...`) or the login page must see light.
4. Solid fills (primary/ok/warn/danger buttons, red nav count, "ส่งแล้ว" badge) must keep readable text in both themes.
5. `localStorage` throwing (private mode) must not break the app — falls back to light.

---

### Task 1: Tokens, fonts, theme module

**Files:** `tailwind.config.js`, `src/index.css` (`@layer base`), `index.html`, create `src/lib/theme.ts` + `src/lib/theme.test.ts`, create `src/styles/tokens.test.ts`.

- [ ] Write `theme.test.ts`: `getTheme()` is `'light'` with nothing stored and when `localStorage.getItem` throws; `setTheme('dark')` then `getTheme()` is `'dark'`; `applyTheme('dark')` sets `document.documentElement.dataset.theme === 'dark'` and the `theme-color` meta content to `#121212`; `applyTheme(null)` removes the attribute and restores `#fbfbfa`.
- [ ] Write `tokens.test.ts`: read `src/index.css` with `fs`, collect `--c-*` names in the `:root` block and in the `html[data-theme='dark']` block, expect the two sets equal and non-empty; read `tailwind.config.js` text and expect no `#` hex inside the `colors` block except `accent` removed (i.e. `accent:` absent).
- [ ] Run both — FAIL (no module / no variables).
- [ ] Implement `theme.ts` (`getTheme`, `setTheme`, `applyTheme`, all storage calls in try/catch).
- [ ] `index.css` base: `:root { --c-paper … --c-on … }` with the spec's light values as channels; `html[data-theme='dark'] { …dark values…; color-scheme: dark }`; `::selection` uses `brand-soft`; add `.num { font-family: theme('fontFamily.mono'); font-variant-numeric: tabular-nums }` and give `.tnum` the mono font.
- [ ] `tailwind.config.js`: every colour → `rgb(var(--c-…) / <alpha-value>)`; add `on`; remove `accent`; `fontFamily.mono = ['"JetBrains Mono"', '"IBM Plex Sans Thai"', 'ui-monospace', 'monospace']`; `borderRadius.xl = '0.5rem'`, `'2xl' = '0.625rem'`; `boxShadow.card = 'none'`, `pop = '0 8px 24px -12px rgb(0 0 0 / 0.25)'`.
- [ ] `index.html`: add `JetBrains+Mono:wght@400;500` to the Google Fonts link; `theme-color` `#fbfbfa`.
- [ ] Replace remaining `accent-*` class uses (DailyDashboard tiles → `text-ink-soft` icons, `bg-brand` bars; ClaimsQueue chip → `danger` tokens) so the build compiles.
- [ ] `npx tsc --noEmit -p . && npx vitest run src/lib/theme.test.ts src/styles/tokens.test.ts` — PASS. Commit `feat: colour tokens as CSS variables, theme module, mono font`.

### Task 2: Component classes and literal colours

**Files:** `src/index.css` (`@layer components`, print rules), `AppShell.tsx` (scrim), `BulkStickerPrint.tsx`, `LinkSendReport.tsx`, `StickerPrint.tsx`, `PhotoGallery.tsx`, `PierLoad.tsx`, `PierGroup.tsx`, `CustomerOrderView.tsx`, `CustomerHelp.tsx`, `OrderStatusTimeline.tsx`, `ShortageReport.tsx`, `ShortageCharts.tsx` (if it has literal colours).

- [ ] Write `src/styles/darkSafe.test.ts`: scan `src/**/*.tsx` (not tests, not `CameraSheet.tsx`, `PhotoGallery.tsx`, `AppLogo.tsx`, which sit on photos or are the logo) for `text-white`, `bg-white`, `bg-ink/` and six-digit hex; expect none. Run — FAIL listing the files above.
- [ ] Sweep: `text-white` on solid fills → `text-on`; `bg-ink text-white` toggles → `bg-ink text-surface`; scrims `bg-ink/40` → `bg-black/50`; photo viewer `bg-ink/85` → `bg-black/85`; ShortageReport `bg-white/20`/`ring-white/70` → token equivalents.
- [ ] `index.css` components per the spec: `.btn` radius `rounded-md`; `.btn-primary` `bg-brand text-on hover:bg-brand/90`; ok/warn/danger `text-on`; `.btn-secondary` hover `bg-paper`; `.card`/`.table-wrap` no shadow; `.badge` `rounded-md`; `.badge-ok-solid` `text-on`; `.data-table thead th` mono uppercase `text-[11px] tracking-wider text-ink-faint bg-surface`; inputs `rounded-md shadow-none`; checkbox disabled tick keeps white stroke (ok fill is dark enough in light; in dark use `--c-on`).
- [ ] Print: `@media print { :root, html[data-theme='dark'] { light values } }` and `.sticker*` use `#000`/`#fff` explicitly.
- [ ] Run `darkSafe.test.ts` + the touched components' tests — PASS. Commit `feat: Supabase-style components; dark-safe colours`.

### Task 3: Shell — monochrome nav, page header, theme switch

**Files:** `AppShell.tsx` (+ test), `src/components/ui/PageHeader.tsx`, delete `src/lib/navAccentStyles.ts` (+ its test if any), `src/lib/roles.ts` (drop `accent` field and `NavAccent` type, update callers' `accent=` props).

- [ ] AppShell tests: (a) with nothing stored, `<html>` has no `data-theme`; (b) clicking "โหมดมืด" sets `data-theme="dark"`, stores `'dark'`, the button becomes "โหมดสว่าง" with `aria-pressed="true"`; (c) a stored `'dark'` is applied on mount and removed on unmount. Run — FAIL.
- [ ] Implement: on mount `applyTheme(getTheme())`, cleanup `applyTheme(null)`; switch button under the name (Moon/Sun icons). Nav items: icon `text-ink-soft` (active: `text-ink`, `weight="fill"`), active row `bg-line/70 text-ink`, no coloured chips; urgent count `bg-danger text-on`.
- [ ] PageHeader: drop `accent`; icon shown plain in `text-ink-soft` at 22px; remove `accent=` from every caller.
- [ ] `npx tsc --noEmit -p .` + AppShell/PageHeader/roles tests — PASS. Commit `feat: monochrome navigation and a dark-mode switch`.

### Task 4: Monospace numbers

**Files:** `src/lib/format.ts` callers are many — apply `.num` where values render: `AmountDue.tsx`, `StatusBadge`-adjacent PO cells in `DailyDashboard.tsx`, `OrderDetail.tsx`, `PackOrder.tsx`, `PackGroup.tsx`, `PierLoad.tsx`, `PierGroup.tsx`, `Debts.tsx`, `FoamBoxes.tsx`, `ClaimsQueue.tsx`, `CustomerOrderView.tsx`, `Stat.tsx`.

- [ ] Test (in `uiPolish.test.tsx`): `AmountDue` and `Stat` values carry the `num` class; Debts row total carries `num`. Run — FAIL.
- [ ] Add `num` to PO numbers, phones, money, box/piece counts in the files above.
- [ ] Run the touched files' tests — PASS. Commit `feat: monospace for PO numbers, phones, money and counts`.

### Task 5: Guide, full verification

- [ ] `docs/user-guide-th.md`: short section "โหมดมืด" (where the switch is, device remembers, customer pages stay light, stickers unaffected) under section 2.
- [ ] Edge headless screenshot of `/login` and a built `/help` page (light) from `npm run build && npx vite preview` for a sanity look.
- [ ] `npx tsc --noEmit -p . && npx vitest run && npm run build` — all green. Commit `docs: dark mode guide`.
