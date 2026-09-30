/**
 * Box stickers (50 x 30 mm, one per paper box / foam box / loose piece).
 * Numbered 1..N across every kind, so "3 / 29" tells the crew how many to
 * expect for that customer in total.
 */

export type StickerKind = 'ลังกระดาษ' | 'ลังโฟม' | 'ชิ้น'
export type Sticker = { no: number; total: number; kind: StickerKind }

/** Every sticker for these counts: paper boxes first, then foam, then pieces. */
export function stickerList(counts: { paper: number; foam: number; piece: number }): Sticker[] {
  const kinds: [StickerKind, number][] = [
    ['ลังกระดาษ', counts.paper],
    ['ลังโฟม', counts.foam],
    ['ชิ้น', counts.piece],
  ]
  const total = kinds.reduce((n, [, c]) => n + Math.max(0, Math.floor(c || 0)), 0)
  const out: Sticker[] = []
  for (const [kind, c] of kinds)
    for (let i = 0; i < Math.max(0, Math.floor(c || 0)); i++)
      out.push({ no: out.length + 1, total, kind })
  return out
}

/**
 * Which sticker numbers to reprint, from what a packer types: "7", "7, 9",
 * "3-5", "2,4-6". Returns null when the text is not a valid selection within
 * 1..total (so the dialog can say so instead of printing the wrong ones).
 */
export function parseStickerSelection(text: string, total: number): number[] | null {
  const parts = text
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  const picked = new Set<number>()
  for (const part of parts) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part)
    if (!m) return null
    const from = Number(m[1])
    const to = m[2] ? Number(m[2]) : from
    if (from < 1 || to > total || from > to) return null
    for (let n = from; n <= to; n++) picked.add(n)
  }
  return [...picked].sort((a, b) => a - b)
}

// Thai above/below-line marks take no horizontal room of their own.
const COMBINING = /[ัิ-ฺ็-๎]/g

/**
 * Font size (mm) for the short name so it fills the 46 mm-wide name line:
 * big for short names ("JJ" ~ 13 mm tall), shrinking for long ones, never
 * below 4 mm.
 */
export function nameFontMm(name: string): number {
  const visible = name.replace(COMBINING, '').length || 1
  return Math.max(4, Math.min(13, 46 / (visible * 0.62)))
}

/** Most boxes/pieces a single order can record; beyond this is a typo. */
export const MAX_COUNT = 999

/**
 * A box/piece count from what was typed: a whole number from 0 to MAX_COUNT.
 * "-1" -> 0, "2.5" -> 2, "" -> 0 -- the database only accepts whole numbers
 * >= 0 and would otherwise reject the save with an English error.
 */
export function toCount(raw: string): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) ? Math.min(MAX_COUNT, Math.max(0, n)) : 0
}
