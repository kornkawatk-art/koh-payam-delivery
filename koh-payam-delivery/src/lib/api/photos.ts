import { supabase } from '../supabase'

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

export type UploadUrlResponse = { uploadUrl: string; key: string; publicUrl: string }

export type RequestUploadUrlArgs =
  | { scope: 'evidence'; orderId: string; contentType: string }
  | { scope: 'claim'; token: string; contentType: string }

/**
 * Ask the `photo-upload-url` edge function for a short-lived R2 presigned PUT
 * URL. Every call carries a bearer token: the anon key by default (the function
 * is deployed with verify_jwt on for the platform gateway), upgraded to the
 * team session's access token for `evidence` when one is present. For `claim`
 * the function validates the order link token and the 48h claim window instead.
 */
export async function requestUploadUrl(args: RequestUploadUrlArgs): Promise<UploadUrlResponse> {
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
  })
  if (!res.ok) throw new Error('ขอลิงก์อัปโหลดรูปไม่สำเร็จ (' + res.status + ')')
  return (await res.json()) as UploadUrlResponse
}

/** Record a team evidence photo (already uploaded to R2) against an order. */
export async function attachEvidencePhoto(
  orderId: string,
  key: string,
  note?: string,
): Promise<void> {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('evidence_photos').insert({
    order_id: orderId,
    r2_key: key,
    note: note ?? null,
    taken_by: u.user?.id ?? null,
  })
  if (error) throw new Error('บันทึกรูปไม่สำเร็จ: ' + error.message)
}
