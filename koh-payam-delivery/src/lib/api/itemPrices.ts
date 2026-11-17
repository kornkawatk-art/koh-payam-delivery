// item_prices (migration 0043): rough unit prices a lead uploads for the shortage report's value
import { supabase } from '../supabase'
import type { PriceRow } from '../itemPrices'

const CHUNK = 200

/** Prices for these item codes (codes without a price are simply missing from the map) */
export async function getItemPrices(itemIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(itemIds.filter(Boolean))]
  const out = new Map<string, number>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('item_prices')
      .select('item_id, price')
      .in('item_id', ids.slice(i, i + CHUNK))
    if (error) throw new Error('โหลดราคาไม่สำเร็จ: ' + error.message)
    for (const r of (data ?? []) as { item_id: string; price: number }[]) out.set(r.item_id, Number(r.price))
  }
  return out
}

/** Save (insert or replace) the uploaded prices */
export async function saveItemPrices(rows: PriceRow[]): Promise<void> {
  const now = new Date().toISOString()
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('item_prices').upsert(
      rows.slice(i, i + 500).map((r) => ({
        item_id: r.itemId,
        price: r.price,
        product_name: r.productName,
        updated_at: now,
      })),
      { onConflict: 'item_id' },
    )
    if (error) throw new Error('บันทึกราคาไม่สำเร็จ: ' + error.message)
  }
}
