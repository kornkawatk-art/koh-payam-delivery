// POST { token, type, orderItemIndex?, boxSeq?, qty, description, photoKeys: string[] }
//   -> { ok: true, claimId }
//
// config.toml sets verify_jwt = false: the customer submits this from an emailed
// link with no Supabase session. Auth here mirrors photo-upload-url's claim
// branch — the order `link_token` plus the 48h claim window (order must be
// `shipped`, `shipped_at` set, and now - shipped_at <= 48h), else 403.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors } from '../_shared/cors.ts'

const JSON_HEADERS = { ...cors, 'Content-Type': 'application/json' }
const CLAIM_WINDOW_MS = 48 * 60 * 60 * 1000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors })
  }

  try {
    const p = await req.json()
    if (!p?.token) return new Response('token required', { status: 400, headers: cors })

    if (!['missing_in_box', 'damaged', 'box_lost'].includes(p.type)) {
      return new Response(JSON.stringify({ error: 'invalid type' }), { status: 400, headers: cors })
    }

    // Photo keys must belong to this order's claim folder. photo-upload-url
    // hands out keys under `claim/<token>/…`; reject anything else outright.
    let photoKeys: string[] = []
    if (Array.isArray(p.photoKeys) && p.photoKeys.length) {
      const prefix = `claim/${p.token}/`
      photoKeys = p.photoKeys.filter((k: unknown): k is string => typeof k === 'string')
      if (
        photoKeys.length !== p.photoKeys.length ||
        photoKeys.some((k) => !k.startsWith(prefix))
      ) {
        return new Response(JSON.stringify({ error: 'invalid photo key' }), {
          status: 400,
          headers: cors,
        })
      }
    }

    const qty = Math.max(1, Math.floor(Number(p.qty) || 1))
    const description = String(p.description ?? '').slice(0, 2000)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: o } = await admin
      .from('orders')
      .select('id,status,shipped_at')
      .eq('link_token', p.token)
      .single()
    if (!o) return new Response('not found', { status: 404, headers: cors })

    const shippedMs = o.shipped_at ? new Date(o.shipped_at).getTime() : 0
    if (o.status !== 'shipped' || !shippedMs || Date.now() - shippedMs > CLAIM_WINDOW_MS) {
      return new Response(JSON.stringify({ error: 'claim window closed' }), {
        status: 403,
        headers: JSON_HEADERS,
      })
    }

    let orderItemId: string | null = null
    if (p.type !== 'box_lost' && Number.isInteger(p.orderItemIndex)) {
      const { data: items } = await admin
        .from('order_items')
        .select('id,line_no')
        .eq('order_id', o.id)
        .order('line_no')
      orderItemId = items?.[p.orderItemIndex]?.id ?? null
    }

    const deadline = new Date(shippedMs + CLAIM_WINDOW_MS).toISOString()
    const { data: claim, error } = await admin
      .from('claims')
      .insert({
        order_id: o.id,
        order_item_id: orderItemId,
        box_seq: p.boxSeq ?? null,
        type: p.type,
        qty,
        description,
        status: 'open',
        deadline_at: deadline,
      })
      .select('id')
      .single()
    if (error || !claim) {
      console.error('submit-claim', error)
      return new Response(JSON.stringify({ error: 'ส่งเรื่องไม่สำเร็จ' }), {
        status: 500,
        headers: JSON_HEADERS,
      })
    }

    if (photoKeys.length) {
      await admin
        .from('claim_photos')
        .insert(photoKeys.map((k) => ({ claim_id: claim.id, r2_key: k })))
    }
    await admin.from('audit_logs').insert({
      user_id: null,
      action: 'claim_submitted',
      entity_type: 'claim',
      entity_id: claim.id,
      meta: { orderId: o.id },
    })

    return new Response(JSON.stringify({ ok: true, claimId: claim.id }), { headers: JSON_HEADERS })
  } catch (e) {
    // Log server-side only; never echo DB/env error text to the customer.
    console.error('submit-claim', e)
    return new Response(JSON.stringify({ error: 'ส่งเรื่องไม่สำเร็จ' }), {
      status: 500,
      headers: JSON_HEADERS,
    })
  }
})
