# Supabase-style redesign — design

Status: approved by the user on 2026-10-12. The look was approved from the preview at
https://claude.ai/artifact/BQXw9KyB8QDWVKkYk3mwg3 ("ok ใช้แบบนี้แหละ").

## Goal

Make the app look calmer and more expensive, in the style of supabase.com: grey-neutral
surfaces, thin 1px borders instead of shadows, small radii, monochrome icons, monospace
numbers, and one accent colour used sparingly. Add a dark mode for team pages.

## Decisions (from the grill)

| # | Decision |
|---|---|
| Q1 | Light by default, with a dark mode the user can switch to. |
| Q2 | Keep our gold as the brand/accent colour. Green stays the "done" status colour. |
| Q3 | Monochrome nav and page-header icons (no per-menu colours). Red count badges stay. |
| Q4 | Team pages and the customer link page (`/o/...`, `/help`) both get the new look. |
| Q5 | First open is always light. The user switches manually; the device remembers (`localStorage`). The phone's own dark setting is ignored. |
| Q6 | The switch exists only on team pages (sidebar, under the user's name; on phones inside the ☰ drawer). Customer pages, login and 2FA are always light. |
| Q7 | JetBrains Mono for PO numbers, phone numbers, money and box/piece counts. |
| ⚙ | Buttons keep a 44px minimum height on touch screens. |
| ⚙ | Status colours keep their meaning (green done, amber warning, red problem, blue info). |
| ⚙ | Box stickers always print black on white, whatever the theme. |
| ⚙ | No tablet layout (phone + desktop only). |

## Tokens

All colours become CSS variables holding RGB channels (`--c-ink: 23 23 23`), and
`tailwind.config.js` maps each Tailwind colour to `rgb(var(--c-…) / <alpha-value>)`, so every
existing class (`bg-ink/90`, `border-ok/25`) keeps working and dark mode only redefines the
variables under `html[data-theme='dark']`.

| token | light | dark | use |
|---|---|---|---|
| paper | `#fbfbfa` | `#121212` | page background |
| surface | `#ffffff` | `#1b1b1b` | cards, sidebar, inputs |
| ink | `#171717` | `#ededed` | main text |
| ink-soft | `#6a6a6a` | `#a1a1a1` | secondary text |
| ink-faint | `#a3a3a3` | `#6c6c6c` | placeholders, captions |
| line | `#ebebea` | `#292929` | borders |
| line-strong | `#dcdcda` | `#383838` | input/button borders |
| brand | `#9a6a1c` | `#d9a54a` | primary button, focus ring, links |
| brand-ink | `#7c5214` | `#e6b865` | brand text |
| brand-soft | `#f6efe1` | `#2a2214` | brand tint |
| ok / ok-ink / ok-soft | `#15803d` `#166534` `#f0fdf4` | `#4ade80` `#86efac` `#13261a` | done |
| warn / -ink / -soft | `#b45309` `#9a3412` `#fffbeb` | `#fbbf24` `#fcd34d` `#2a2210` | warning |
| danger / -ink / -soft | `#b91c1c` `#991b1b` `#fef2f2` | `#f87171` `#fca5a5` `#2c1717` | problem |
| info / -ink / -soft | `#1d4ed8` `#1e40af` `#eff6ff` | `#60a5fa` `#93c5fd` `#15202f` | info |
| **on** (new) | `#ffffff` | `#0f0f0f` | text on a solid colour fill (primary/ok/warn/danger buttons, solid badges, red counts) |

- Radii: cards and tables 8px (`rounded-xl` → 0.5rem, `rounded-2xl` → 0.625rem); buttons and
  inputs 6px.
- Shadows: `shadow-card` → none (the border carries it). `shadow-pop` stays, softer, for the
  drawer, popups and the sticky action bar.
- Fonts: body Inter + IBM Plex Sans Thai (unchanged). New `font-mono` = JetBrains Mono, falling
  back to IBM Plex Sans Thai (for Thai inside a number cell) then system monospace. A `.num`
  class = mono + tabular digits.
- `accent-*` colours are removed from navigation and page headers. Where a page used an accent
  colour as decoration (dashboard tiles, the claims-queue chip), it uses neutral or semantic
  tokens instead.

## Components

- `.btn-primary`: gold fill, `text-on` (was black fill).
- `.btn-ok/-warn/-danger`, `.badge-ok-solid`, red nav counts: `text-on` instead of `text-white`.
- `.btn-secondary`: surface fill, `line-strong` border, hover `paper`.
- `.card`, `.table-wrap`: 1px `line` border, no shadow, 8px radius.
- `.data-table` header: small uppercase mono labels in `ink-faint` (like the preview).
- Badges: 6px radius instead of a full pill, 1px tinted border. Status badges keep their icons.
- Selected toggles that use `bg-ink text-white` (boat picker, language switch) use
  `bg-ink text-surface` so they invert correctly in dark mode.
- Scrims and the photo viewer use `bg-black/…`, not `bg-ink/…` (ink turns light in dark mode).
- Sidebar: `surface` background, monochrome icons in `ink-soft`; the active item has a `line`
  background and `ink` text with a filled icon. Page header icon: no coloured chip; icon in
  `ink-soft`.
- `theme-color` meta follows the active theme.

## Theme switch

- `src/lib/theme.ts`: `getTheme(): 'light' | 'dark'` (reads `localStorage['theme']`, default
  `'light'`, never the OS setting), `setTheme(t)` (writes it), `applyTheme(t | null)` (sets or
  removes `data-theme` on `<html>` and updates `theme-color`). Storage errors fall back to light.
- `AppShell` applies the stored theme on mount and removes it on unmount, so pages outside the
  shell (login, 2FA, `/o/...`, `/help`, `/liff/...`) are always light even on a device set to dark.
- The switch: a button under the user's name in the sidebar — "โหมดมืด" with a moon icon when
  light, "โหมดสว่าง" with a sun icon when dark. `aria-pressed` reflects dark on.

## Printing

`@media print` and the sticker classes force black text on white and ignore the theme
variables, so a sticker printed from dark mode is identical to one printed from light mode.

## Monospace numbers

`.num` goes on: PO numbers (`makro_order_no`) wherever they are shown, phone numbers, money
(`formatTHB` output, `AmountDue`), box/piece counts, nav counts and dashboard tile figures. The
existing `.tnum` class gets the mono font too.

## Out of scope

Logo redesign (the logo keeps its colours), new layouts, new pages, and a tablet layout.

## Risks

- A component with a literal colour that reads in one theme only. Mitigation: a test that every
  `--c-*` variable defined for light is also defined for dark, plus a grep in the final review for
  `text-white`/`bg-white`/hex literals on non-photo surfaces.
- Contrast in dark mode for `ink-faint` text: it is used only for placeholders and captions, as
  today.
