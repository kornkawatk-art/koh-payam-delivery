import { supabase } from '../supabase'

export type AuditLogRow = { id: number; createdAt: string; message: string }

type RawAuditLogRow = {
  id: number
  user_id: string | null
  action: string
  entity_type: string
  entity_id: string
  meta: Record<string, any> | null
  created_at: string
}

// Same 4 labels as StatusBadge.tsx's LABEL map -- kept in sync manually (not
// imported) because that component's map is keyed for badge rendering, not
// meant as a shared constant; duplicating 4 short strings here is cheaper
// than coupling this file to a UI component.
const STATUS_LABEL: Record<string, string> = {
  imported: 'นำเข้าแล้ว',
  packed: 'แพ็คเสร็จ',
  at_pier: 'ถึงท่าเรือ',
  shipped: 'ส่งแล้ว',
}

type OrderLookup = { makro_order_no: string; ship_day_id: string | null }
type BoatEntry = { id: string; name: string }

// Every action this app currently writes to audit_logs, and the plain-Thai
// sentence it renders as -- see task-1-brief.md's template table (verified
// against every real logAction(...)/raw insert call site). Lookups needed to
// fill in a sentence (order number, claim's order number, boat name, actor
// name) are passed in pre-resolved via the four maps below so this function
// stays a pure, easily-testable string builder with zero of its own queries.
function buildMessage(
  r: RawAuditLogRow,
  orderById: Map<string, OrderLookup>,
  claimOrderNoById: Map<string, string | undefined>,
  boatsByShipDay: Map<string, BoatEntry[]>,
  profileNameById: Map<string, string>,
): string {
  const meta = r.meta ?? {}
  // "โดย {name}" clause -- omitted entirely when user_id is null (the 3
  // customer/system-initiated actions), falls back to "ทีมงาน" when the
  // profile row itself can't be resolved (deleted account).
  const by = r.user_id ? ` โดย ${profileNameById.get(r.user_id) ?? 'ทีมงาน'}` : ''

  const orderNo = (entityId: string) => orderById.get(entityId)?.makro_order_no ?? entityId
  const claimOrderNo = (entityId: string) => claimOrderNoById.get(entityId) ?? entityId

  switch (r.action) {
    case 'import':
      return `นำเข้าออเดอร์วันที่ ${meta.shipDate} — ใหม่ ${meta.created} รายการ · sync ${meta.synced} รายการ${by}`

    case 'status_change': {
      const fromLabel = STATUS_LABEL[meta.from] ?? meta.from
      const toLabel = STATUS_LABEL[meta.to] ?? meta.to
      return `เปลี่ยนสถานะออเดอร์ ${orderNo(r.entity_id)} จาก "${fromLabel}" → "${toLabel}"${by}`
    }

    case 'boat_set': {
      const order = orderById.get(r.entity_id)
      const boats = order?.ship_day_id ? boatsByShipDay.get(order.ship_day_id) : undefined
      const boat = boats?.find((b) => String(b.id) === String(meta.boatId))
      const boatName = boat ? boat.name : `เรือ #${meta.boatId}`
      return `เลือก${boatName}ให้ออเดอร์ ${orderNo(r.entity_id)}${by}`
    }

    case 'pier_name_set':
      return `บันทึกชื่อคนลงเรือ "${meta.pierName}" ให้ออเดอร์ ${orderNo(r.entity_id)}${by}`

    case 'regen_link':
      return `สร้างลิงก์ลูกค้าใหม่ให้ออเดอร์ ${orderNo(r.entity_id)}${by}`

    case 'order_deleted':
      // camelCase meta keys, and no order lookup -- the order row is gone.
      return `ลบออเดอร์ ${meta.makroOrderNo} (${meta.customerNameEn}) ถาวร — กำหนดส่ง ${meta.shipDate}${by}`

    case 'pack_saved':
      return `บันทึกแพ็คออเดอร์ ${orderNo(r.entity_id)} — ลังกระดาษ ${meta.paperCount} · ลังโฟม ${meta.foamCount} · ชิ้น ${meta.pieceCount}${by}`

    case 'claim_submitted':
      // Customer-initiated -- no "โดย" clause. user_id is always null.
      return `ลูกค้ายื่นเคลม — ออเดอร์ ${claimOrderNo(r.entity_id)}`

    case 'claim_resolved': {
      const decisionLabel = meta.decision === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'
      let resolutionClause = ''
      if (meta.decision === 'approved') {
        const resolutionLabel =
          meta.resolution === 'refund'
            ? 'คืนเงิน'
            : meta.resolution === 'resend_next_day'
              ? 'ส่งชดเชยวันถัดไป'
              : ''
        resolutionClause = resolutionLabel ? ` (${resolutionLabel})` : ''
      }
      const failClause = meta.resendBackorderFailed ? ' ⚠️ สร้างรายการส่งชดเชยไม่สำเร็จ' : ''
      return `หัวหน้า${decisionLabel}เคลม — ออเดอร์ ${claimOrderNo(r.entity_id)}${resolutionClause}${by}${failClause}`
    }

    case 'claim_auto_closed':
      // System-triggered -- always user_id: null, no "โดย" clause.
      return `ปิดงานเคลมอัตโนมัติ — ออเดอร์ ${claimOrderNo(r.entity_id)} (ของชดเชยส่งถึงลูกค้าแล้ว)`

    case 'line_contact_registered':
      // entity_id IS the phone number -- no lookup needed. Customer-initiated.
      return meta.replacedExisting
        ? `เบอร์ ${r.entity_id} อัปเดตชื่อ LINE (บัญชีเดิม)`
        : `เบอร์ ${r.entity_id} ลงทะเบียนผูก LINE ครั้งแรก`

    case 'line_contact_pending_created':
      return `เบอร์ ${r.entity_id} มีคำขอผูก LINE บัญชีใหม่ รอหัวหน้าตรวจสอบ`

    case 'line_contact_approved':
      return `หัวหน้าอนุมัติคำขอเปลี่ยน LINE ของเบอร์ ${r.entity_id}${by}`

    case 'line_contact_rejected':
      return `หัวหน้าปฏิเสธคำขอเปลี่ยน LINE ของเบอร์ ${r.entity_id}${by}`

    default:
      // Honest fallback for any future 15th action type -- never crash.
      return `${r.action} (${r.entity_type})`
  }
}

// Reverse-chronological feed of every audit_logs row, each formatted into a
// ready-to-render Thai sentence. No client-side date filter: audit_logs'
// own cron already purges rows older than 30 days (0006_cron_cleanup.sql),
// so re-filtering here would just be redundant work. The .limit(1000) is a
// defensive cap against an unexpectedly large result, not a real pagination
// UI.
export async function listAuditLogs(): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, user_id, action, entity_type, entity_id, meta, created_at')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw new Error('โหลดประวัติการใช้งานไม่สำเร็จ: ' + error.message)
  const rows = (data ?? []) as RawAuditLogRow[]

  // --- collect distinct ids actually needed by this page of rows ---
  const orderIds = new Set<string>()
  const claimIds = new Set<string>()
  const userIds = new Set<string>()
  for (const r of rows) {
    // order_deleted's meta already carries everything needed -- the order
    // row itself no longer exists, so never attempt to look it up.
    if (r.entity_type === 'order' && r.action !== 'order_deleted') orderIds.add(r.entity_id)
    if (r.entity_type === 'claim') claimIds.add(r.entity_id)
    if (r.user_id) userIds.add(r.user_id)
  }

  // One batched query per table actually referenced -- never N+1, and
  // skipped entirely when this page of rows doesn't need it.
  const orderById = new Map<string, OrderLookup>()
  if (orderIds.size > 0) {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, makro_order_no, ship_day_id')
      .in('id', Array.from(orderIds))
    for (const o of (orders ?? []) as any[]) {
      orderById.set(o.id, { makro_order_no: o.makro_order_no, ship_day_id: o.ship_day_id })
    }
  }

  const claimOrderNoById = new Map<string, string | undefined>()
  if (claimIds.size > 0) {
    const { data: claims } = await supabase
      .from('claims')
      .select('id, orders(makro_order_no)')
      .in('id', Array.from(claimIds))
    for (const c of (claims ?? []) as any[]) {
      claimOrderNoById.set(c.id, c.orders?.makro_order_no)
    }
  }

  // ship_days lookup only needed for boat_set rows (to resolve boatId -> name).
  const shipDayIds = new Set<string>()
  for (const r of rows) {
    if (r.action !== 'boat_set') continue
    const shipDayId = orderById.get(r.entity_id)?.ship_day_id
    if (shipDayId) shipDayIds.add(shipDayId)
  }
  const boatsByShipDay = new Map<string, BoatEntry[]>()
  if (shipDayIds.size > 0) {
    const { data: shipDays } = await supabase
      .from('ship_days')
      .select('id, boats')
      .in('id', Array.from(shipDayIds))
    for (const sd of (shipDays ?? []) as any[]) {
      boatsByShipDay.set(sd.id, sd.boats ?? [])
    }
  }

  const profileNameById = new Map<string, string>()
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', Array.from(userIds))
    for (const p of (profiles ?? []) as any[]) {
      profileNameById.set(p.id, p.name)
    }
  }

  // Every lookup above is best-effort: a row whose order/claim/profile can't
  // be resolved falls back to a generic phrase inside buildMessage rather
  // than throwing -- one bad row must never break the whole list.
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    message: buildMessage(r, orderById, claimOrderNoById, boatsByShipDay, profileNameById),
  }))
}
