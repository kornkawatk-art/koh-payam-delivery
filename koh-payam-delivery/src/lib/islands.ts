// Islands the team delivers to. Adding one: extend Island + ISLANDS here,
// teach classifyIsland (src/lib/import/buildImport.ts) its address keywords,
// and widen the check constraint on orders.island.
export type Island = 'payam' | 'chang'

export const ISLANDS: Record<Island, { th: string; en: string }> = {
  payam: { th: 'เกาะพยาม', en: 'Koh Payam' },
  chang: { th: 'เกาะช้าง', en: 'Koh Chang' },
}

export const ISLAND_LIST: Island[] = ['payam', 'chang']

export const isIsland = (v: unknown): v is Island =>
  typeof v === 'string' && (ISLAND_LIST as string[]).includes(v)

/** The island's name, or null for an order whose island hasn't been picked yet. */
export function islandName(v: unknown, lang: 'th' | 'en' = 'th'): string | null {
  return isIsland(v) ? ISLANDS[v][lang] : null
}
