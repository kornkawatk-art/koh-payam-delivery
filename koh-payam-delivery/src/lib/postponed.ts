export type OtherDayOrder = { id: string; makro_order_no: string; ship_date: string; status: string }

// A PO Makro postponed (yesterday -> today) is still in the system on the old day. The importer
// can tick it to move it to the day being imported. Only a PO on exactly one other day that has
// not gone out yet (not shipped / picked up) can move -- a delivered one is just re-listed.
export function movableNos(rows: OtherDayOrder[]): Set<string> {
  const byNo = new Map<string, OtherDayOrder[]>()
  for (const r of rows) byNo.set(r.makro_order_no, [...(byNo.get(r.makro_order_no) ?? []), r])
  const out = new Set<string>()
  for (const [no, rs] of byNo)
    if (rs.length === 1 && !['shipped', 'picked_up'].includes(rs[0].status)) out.add(no)
  return out
}
