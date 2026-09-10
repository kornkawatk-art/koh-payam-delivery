import { supabase } from '../supabase'
import { createResendBackorder } from './backorders'
import { logAction } from './audit'

export type ClaimRow = {
  id: string
  order_id: string
  makro_order_no: string | undefined
  customer_name_en: string | undefined
  type: string
  qty: number
  status: string
  deadline_at: string
  created_at: string
}

export async function listClaims(filter: { status?: string } = {}): Promise<ClaimRow[]> {
  let q = supabase
    .from('claims')
    .select(
      'id,order_id,type,qty,status,deadline_at,created_at, orders(makro_order_no,customer_name_en)',
    )
    .order('deadline_at', { ascending: true })
  if (filter.status) q = q.eq('status', filter.status)
  const { data, error } = await q
  if (error) throw new Error('โหลดคิวเคลมไม่สำเร็จ: ' + error.message)
  return (data ?? []).map((c: any) => ({
    id: c.id,
    order_id: c.order_id,
    type: c.type,
    qty: Number(c.qty),
    status: c.status,
    deadline_at: c.deadline_at,
    created_at: c.created_at,
    makro_order_no: c.orders?.makro_order_no,
    customer_name_en: c.orders?.customer_name_en,
  }))
}

export async function getClaim(id: string) {
  const { data, error } = await supabase
    .from('claims')
    .select(
      '*, orders(makro_order_no,customer_name_en,total_value_cached), order_items(product_name,unit_price), claim_photos(r2_key)',
    )
    .eq('id', id)
    .single()
  if (error) throw new Error('โหลดเคลมไม่สำเร็จ: ' + error.message)
  return data
}

export async function resolveClaim(
  id: string,
  input: {
    decision: 'approved' | 'rejected'
    resolution?: 'refund' | 'resend_next_day'
    refundAmount?: number
    note?: string
  },
): Promise<void> {
  const {
    data: cur,
    error: readErr,
  } = await supabase.from('claims').select('description').eq('id', id).single()
  if (readErr || !cur) throw new Error('ไม่พบเคลม')
  const { data: u } = await supabase.auth.getUser()
  const patch: Record<string, unknown> = {
    status: input.decision,
    resolution: input.decision === 'approved' ? input.resolution ?? null : null,
    refund_amount:
      input.decision === 'approved' &&
      input.resolution === 'refund' &&
      Number.isFinite(input.refundAmount)
        ? input.refundAmount
        : 0,
    resolved_by: u.user?.id ?? null,
    resolved_at: new Date().toISOString(),
  }
  if (input.note) {
    patch.description = `${(cur as any)?.description ?? ''}\n[ทีม] ${input.note}`.trim()
  }
  const { error } = await supabase.from('claims').update(patch).eq('id', id)
  if (error) throw new Error('บันทึกผลเคลมไม่สำเร็จ: ' + error.message)

  if (input.decision === 'approved' && input.resolution === 'resend_next_day') {
    try {
      await createResendBackorder(id)
    } catch (e) {
      await logAction('claim_resolved', 'claim', id, {
        decision: input.decision,
        resolution: input.resolution,
        resendBackorderFailed: true,
      })
      throw new Error(
        'บันทึกผลเคลมแล้ว แต่สร้างรายการส่งชดเชยไม่สำเร็จ กรุณาสร้างด้วยตนเอง: ' +
          (e as Error).message,
      )
    }
  }
  await logAction('claim_resolved', 'claim', id, {
    decision: input.decision,
    resolution: input.resolution,
  })
}
