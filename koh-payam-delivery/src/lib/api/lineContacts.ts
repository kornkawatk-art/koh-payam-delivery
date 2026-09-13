import { supabase } from '../supabase'
import { logAction } from './audit'

export type LineContactRow = {
  phone: string
  displayName: string | null
  createdAt: string
}

export type PendingLineContactRow = {
  phone: string
  oldDisplayName: string | null
  pendingDisplayName: string | null
  requestedAt: string
}

// Everyone who has linked their phone number to the shop's LINE account via
// the LIFF registration flow (LineRegister.tsx / register-line-contact).
// Newest registration first -- the DB `order by created_at desc` is trusted
// as-is, not re-sorted client-side.
export async function listLineContacts(): Promise<LineContactRow[]> {
  const { data, error } = await supabase
    .from('line_contacts')
    .select('phone,display_name,created_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error('โหลดรายชื่อผู้ลงทะเบียน LINE ไม่สำเร็จ: ' + error.message)
  return (data ?? []).map((r: any) => ({
    phone: r.phone,
    displayName: r.display_name,
    createdAt: r.created_at,
  }))
}

// Rows where a customer tried to re-register a phone to a DIFFERENT LINE
// account than the one already stored (register-line-contact stages this
// instead of writing straight through -- feature/line-contact-approval).
// Oldest request first so a manager clears the backlog in the order it built
// up, not last-in-first-out.
export async function listPendingLineContactRequests(): Promise<PendingLineContactRow[]> {
  const { data, error } = await supabase
    .from('line_contacts')
    .select('phone, display_name, pending_display_name, pending_requested_at')
    .not('pending_line_user_id', 'is', null)
    .order('pending_requested_at', { ascending: true })
  if (error) throw new Error('โหลดคำขอรออนุมัติไม่สำเร็จ: ' + error.message)
  return (data ?? []).map((r: any) => ({
    phone: r.phone,
    oldDisplayName: r.display_name,
    pendingDisplayName: r.pending_display_name,
    requestedAt: r.pending_requested_at,
  }))
}

// Manager decision on a pending cross-account overwrite request. Read-then-write
// against the phone's row (mirrors resolveClaim()'s shape in ./claims.ts):
// the read is needed both to copy the pending values into the live columns on
// approve, and to record old-vs-new in the audit meta either way.
//
// approve: line_user_id/display_name become the pending values; all three
//   pending_* columns clear back to null.
// reject: pending_* columns clear back to null; line_user_id/display_name are
//   left untouched (still the old owner). No customer-facing notification.
export async function resolveLineContactRequest(
  phone: string,
  decision: 'approve' | 'reject',
): Promise<void> {
  const { data: cur, error: readErr } = await supabase
    .from('line_contacts')
    .select('line_user_id, display_name, pending_line_user_id, pending_display_name')
    .eq('phone', phone)
    .single()
  if (readErr || !cur) throw new Error('ไม่พบคำขอนี้')

  const row = cur as {
    line_user_id: string | null
    display_name: string | null
    pending_line_user_id: string | null
    pending_display_name: string | null
  }

  // Another call (double-click, two managers, a stale re-render) may have
  // already resolved this same phone's request between our read and now --
  // in that case pending_line_user_id is already cleared and there is
  // nothing left to decide on. Bail out before writing anything.
  if (!row.pending_line_user_id) throw new Error('คำขอนี้ถูกดำเนินการไปแล้ว')

  const patch =
    decision === 'approve'
      ? {
          line_user_id: row.pending_line_user_id,
          display_name: row.pending_display_name,
          pending_line_user_id: null,
          pending_display_name: null,
          pending_requested_at: null,
        }
      : {
          pending_line_user_id: null,
          pending_display_name: null,
          pending_requested_at: null,
        }

  // Guard the write with the exact pending_line_user_id we just read, so the
  // update only takes effect if no other call resolved this request in the
  // meantime. If it did, this filter matches zero rows instead of clobbering
  // whatever the other call already wrote.
  const { data: updated, error } = await supabase
    .from('line_contacts')
    .update(patch)
    .eq('phone', phone)
    .eq('pending_line_user_id', row.pending_line_user_id)
    .select('phone')
  if (error) throw new Error('บันทึกผลคำขอไม่สำเร็จ: ' + error.message)
  if (!updated || updated.length === 0) {
    throw new Error(
      'คำขอนี้ถูกดำเนินการไปแล้ว หรือมีคำขอใหม่เข้ามาแทน กรุณาโหลดหน้าใหม่',
    )
  }

  await logAction(
    decision === 'approve' ? 'line_contact_approved' : 'line_contact_rejected',
    'line_contact',
    phone,
    { oldLineUserId: row.line_user_id, newLineUserId: row.pending_line_user_id },
  )
}
