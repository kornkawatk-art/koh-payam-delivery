// POST { scope: 'evidence' | 'claim', contentType, orderId?, token?, stage? }
//   -> { uploadUrl, key, publicUrl }
//
// `stage` ('pack' | 'handoff') only rides along on scope 'evidence'; anything
// else (including absent) is normalised to 'handoff'. It does NOT change the R2
// folder (still `evidence/${orderId}/…`) — the DB column is the source of truth.
//
// Auth is done here (config.toml sets verify_jwt = false because customers hit
// the 'claim' path with no Supabase session):
//   - scope 'evidence': requires a valid session of an ACTIVE team member in
//                       `Authorization: Bearer`, and an orderId that exists
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
    const { scope, token, orderId, contentType, stage: rawStage } = await req.json()

    // Normalise the optional evidence `stage`: only 'pack' | 'handoff' are valid,
    // everything else (including absent) falls back to 'handoff'. Kept for
    // forward-compat / observability — it does not affect the R2 key or response.
    // deno-lint-ignore no-unused-vars
    const stage = scope === 'evidence' && rawStage === 'pack' ? 'pack' : 'handoff'

    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return new Response('unsupported content type', { status: 400, headers: cors })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let folder: string
    if (scope === 'evidence') {
      const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
      const { data: u } = await admin.auth.getUser(jwt ?? '')
      if (!u.user) return new Response('unauthorized', { status: 401, headers: cors })
      // A real session is not enough: a deactivated staff account (or any
      // newly created account, which starts inactive) must not be able to
      // mint upload URLs into the public bucket. Mirrors
      // public.is_team_member() and the same check in send-order-links.
      const { data: profile } = await admin
        .from('profiles')
        .select('is_active')
        .eq('id', u.user.id)
        .maybeSingle()
      if (!profile?.is_active) return new Response('forbidden', { status: 403, headers: cors })
      if (!orderId) return new Response('orderId required', { status: 400, headers: cors })
      // Only real orders get an evidence folder (orderId is used as a key
      // prefix, so an arbitrary string must not become one).
      const { data: order } = await admin.from('orders').select('id').eq('id', orderId).maybeSingle()
      if (!order) return new Response('order not found', { status: 404, headers: cors })
      folder = `evidence/${order.id}`
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
