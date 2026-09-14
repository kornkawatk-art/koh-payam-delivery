import { supabase } from '../supabase'

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

export type UploadUrlResponse = { uploadUrl: string; key: string; publicUrl: string }

export type RequestUploadUrlArgs =
  | { scope: 'evidence'; orderId: string; contentType: string; stage?: 'pack' | 'handoff' }
  | { scope: 'claim'; token: string; contentType: string }

/**
 * Ask the `photo-upload-url` edge function for a short-lived R2 presigned PUT
 * URL. Every call carries a bearer token: the anon key by default (the function
 * is deployed with verify_jwt on for the platform gateway), upgraded to the
 * team session's access token for `evidence` when one is present. For `claim`
 * the function validates the order link token and the 48h claim window instead.
 */
export async function requestUploadUrl(
  args: RequestUploadUrlArgs,
  signal?: AbortSignal,
): Promise<UploadUrlResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  }
  if (args.scope === 'evidence') {
    const { data: sess } = await supabase.auth.getSession()
    if (sess.session) headers.Authorization = `Bearer ${sess.session.access_token}`
  }
  const res = await fetch(`${FN_BASE}/photo-upload-url`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
    signal,
  })
  if (!res.ok) throw new Error('ขอลิงก์อัปโหลดรูปไม่สำเร็จ (' + res.status + ')')
  return (await res.json()) as UploadUrlResponse
}

/**
 * Record a team evidence photo (already uploaded to R2) against an order.
 * `stage` marks whether it was taken at the pack step or the pier handoff;
 * it defaults to 'handoff' when the options object is omitted.
 */
export async function attachEvidencePhoto(
  orderId: string,
  key: string,
  opts?: { stage?: 'pack' | 'handoff'; note?: string },
): Promise<void> {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('evidence_photos').insert({
    order_id: orderId,
    r2_key: key,
    note: opts?.note ?? null,
    taken_by: u.user?.id ?? null,
    stage: opts?.stage ?? 'handoff',
  })
  if (error) throw new Error('บันทึกรูปไม่สำเร็จ: ' + error.message)
}

/**
 * Undo an accidental attach (wrong photo uploaded during pack/pier) — deletes
 * the evidence_photos row. `evidence_photos`' own `team_write` RLS policy
 * (0007_hardening.sql, `for all` gated on is_team_member()) already permits
 * any active team member to delete it; no policy change needed. A
 * `before delete` trigger on this table (0007_hardening.sql,
 * tg_queue_r2_key) already queues the row's r2_key into r2_delete_queue, so
 * the underlying R2 object is cleaned up the same way an order/claim
 * deletion's photos already are -- this function doesn't need to touch R2
 * itself. Matched on (order_id, r2_key): each upload gets a fresh
 * UUID-suffixed key (photo-upload-url), so this can never ambiguously
 * delete more than the one row the caller means.
 */
export async function removeEvidencePhoto(orderId: string, r2Key: string): Promise<void> {
  const { error } = await supabase
    .from('evidence_photos')
    .delete()
    .eq('order_id', orderId)
    .eq('r2_key', r2Key)
  if (error) throw new Error('ลบรูปไม่สำเร็จ: ' + error.message)
}

export type ExistingPhoto = { key: string; url: string }

/**
 * Photos already saved for this order/stage, as `PhotoCapture`'s
 * `initialPhotos` prop expects (key + a displayable R2 public URL). Used by
 * screens that don't otherwise fetch per-order evidence_photos rows (e.g.
 * PierLoad.tsx's order list is a lean column set) -- PackOrder.tsx already
 * has them via `getOrder()`'s `evidence_photos(*)` and builds this shape
 * inline instead of calling this.
 */
export async function listEvidencePhotos(
  orderId: string,
  stage: 'pack' | 'handoff',
): Promise<ExistingPhoto[]> {
  const { data, error } = await supabase
    .from('evidence_photos')
    .select('r2_key')
    .eq('order_id', orderId)
    .eq('stage', stage)
  if (error) throw new Error('โหลดรูปหลักฐานไม่สำเร็จ: ' + error.message)
  const base = import.meta.env.VITE_R2_PUBLIC_BASE_URL as string
  return (data ?? []).map((r: any) => ({ key: r.r2_key, url: `${base}/${r.r2_key}` }))
}
