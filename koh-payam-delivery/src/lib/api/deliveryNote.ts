// The team's delivery note for one PO (ใบส่งของ): the order, its lines in file order, and each item's
// barcodes from item_barcodes (migration 0044; before it runs the note shows 6-digit codes only).
import { supabase } from '../supabase'
import type { DeliveryNote } from '../deliveryNote'

type Row = {
  makro_order_no: string
  customer_name_en: string
  member_card?: string | null
  invoice_no?: string | null
  synced_at?: string | null
  ship_date: string
  island: string | null
  boat_id: string | null
  paper_box_count: number | null
  foam_box_count: number | null
  piece_count: number | null
  ship_days: { boats: { id: string; name: string }[] | null } | null
  order_items: {
    product_name: string
    makro_item_id: string | null
    qty_ordered: number
    qty_shipped: number
    status: string
    line_no: number | null
  }[]
}

/** Barcodes per item code; a missing table or a failed read just means none */
export async function getItemBarcodes(itemIds: string[]): Promise<Map<string, string[]>> {
  const ids = [...new Set(itemIds.filter(Boolean))]
  const out = new Map<string, string[]>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('item_barcodes').select('item_id, barcodes').in('item_id', ids.slice(i, i + 200))
    if (error) return out
    for (const r of (data ?? []) as { item_id: string; barcodes: string[] }[]) out.set(r.item_id, r.barcodes ?? [])
  }
  return out
}

export async function getDeliveryNote(orderId: string): Promise<DeliveryNote> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      '*, ship_days(boats), order_items(product_name,makro_item_id,qty_ordered,qty_shipped,status,line_no)',
    )
    .eq('id', orderId)
    .single()
  if (error || !data) throw new Error('โหลดออเดอร์ไม่สำเร็จ' + (error ? ': ' + error.message : ''))
  const o = data as unknown as Row
  const lines = [...(o.order_items ?? [])].sort((a, b) => Number(a.line_no ?? 0) - Number(b.line_no ?? 0))
  const codes = await getItemBarcodes(lines.map((l) => l.makro_item_id ?? ''))
  return {
    orderNo: o.makro_order_no,
    customerName: o.customer_name_en,
    memberCard: o.member_card ?? null,
    invoiceNo: o.invoice_no ?? null,
    shipDate: o.ship_date,
    island: o.island,
    boatName: (o.ship_days?.boats ?? []).find((b) => b.id === o.boat_id)?.name ?? null,
    boxes: { paper: o.paper_box_count ?? 0, foam: o.foam_box_count ?? 0, piece: o.piece_count ?? 0 },
    syncedAt: o.synced_at ?? null,
    items: lines.map((l, i) => ({
      lineNo: l.line_no ?? i + 1,
      itemId: l.makro_item_id || null,
      productName: l.product_name,
      barcodes: l.makro_item_id ? (codes.get(l.makro_item_id) ?? []) : [],
      ordered: Number(l.qty_ordered),
      shipped: Number(l.qty_shipped),
      isShort: l.status === 'short',
    })),
  }
}
