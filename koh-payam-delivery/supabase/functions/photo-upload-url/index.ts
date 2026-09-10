// POST { scope: 'evidence' | 'claim', contentType, orderId?, token? }
//   -> { uploadUrl, key, publicUrl }
//
// Auth is done here (config.toml sets verify_jwt = false because customers hit
// the 'claim' path with no Supabase session):
//   - scope 'evidence': requires a valid team session in `Authorization: Bearer`
//   - scope 'claim'   : requires an order `link_token` whose order is `shipped`
//                       and still inside the 48h claim window (from `shipped_at`)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors } from '../_shared/cors.ts'
import { presignPutUrl } from '../_shared/r2.ts'

const JSON_HEADERS = { ...cors, 'Content-Type': 'application/json' }
const CLAIM_WINDOW_MS = 48 * 60 * 60 * 1000
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors })
  }

  try {
    const { scope, token, orderId, contentType } = await req.json()

    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return new Response('unsupported content type', { status: 400, headers: cors })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let folder: string
    if (scope === 'evidence') {
      const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
      const { data: u } = await admin.auth.getUser(jwt ?? '')
      if (!u.user) return new Response('unauthorized', { status: 401, headers: cors })
      if (!orderId) return new Response('orderId required', { status: 400, headers: cors })
      folder = `evidence/${orderId}`
    } else if (scope === 'claim') {
      if (!token) return new Response('token required', { status: 400, headers: cors })
      const { data: o } = await admin
        .from('orders')
        .select('id,status,shipped_at')
        .eq('link_token', token)
        .single()
      if (!o) return new Response('not found', { status: 404, headers: cors })
      if (
        o.status !== 'shipped' ||
        !o.shipped_at ||
        Date.now() - new Date(o.shipped_at).getTime() > CLAIM_WINDOW_MS
      ) {
        return new Response('claim window closed', { status: 403, headers: cors })
      }
      folder = `claim/${token}`
    } else {
      return new Response('bad scope', { status: 400, headers: cors })
    }

    const key = `${folder}/${crypto.randomUUID()}.jpg`
    const { uploadUrl, publicUrl } = await presignPutUrl(key, contentType)
    return new Response(JSON.stringify({ uploadUrl, key, publicUrl }), { headers: JSON_HEADERS })
  } catch (e) {
    // Log the detail server-side only; never echo DB/env error text to callers.
    console.error('photo-upload-url', e)
    return new Response(JSON.stringify({ error: 'ขอลิงก์อัปโหลดไม่สำเร็จ' }), {
      status: 500,
      headers: JSON_HEADERS,
    })
  }
})
