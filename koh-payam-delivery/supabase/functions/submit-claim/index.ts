// POST { token, type, items: { orderItemIndex, qty }[], description, photoKeys: string[] }
//   -> { ok: true, claimId }
//
// `items` holds the order_items this claim references, each with its own qty:
// box_lost must send [] (no item is referenced), damaged and missing_in_box
// must both send 1+ entries (a claim can reference several products at
// once). Each entry's qty is clamped server-side to that order_item's
// qty_shipped — defense-in-depth against a client that bypasses the UI cap.
// The claim + its items are created atomically by the `create_claim` RPC.
//
// config.toml sets verify_jwt = false: the customer submits this from an emailed
// link with no Supabase session. Auth here mirrors photo-upload-url's claim
// branch — the order `link_token` plus the 48h claim window (order must be
// `shipped`, `shipped_at` set, and now - shipped_at <= 48h), else 403.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors } from '../_shared/cors.ts'

const JSON_HEADERS = { ...cors, 'Content-Type': 'application/json' }
const CLAIM_WINDOW_MS = 48 * 60 * 60 * 1000

// How many `items` entries each claim type requires.
const ITEMS_COUNT_OK: Record<string, (n: number) => boolean> = {
  box_lost: (n) => n === 0,
  damaged: (n) => n >= 1,
  missing_in_box: (n) => n >= 1,
}

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

    const rawItems = Array.isArray(p.items) ? p.items : []
    if (!ITEMS_COUNT_OK[p.type](rawItems.length)) {
      return new Response(JSON.stringify({ error: 'invalid items' }), { status: 400, headers: cors })
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

    // Resolve each item's orderItemIndex to an order_items.id the same way the
    // single-item form used to: index into this order's items ordered by
    // line_no. Fetched once and reused for every entry in `items`. qty_shipped
    // is fetched alongside so each entry's qty can be clamped below.
    let orderItemsList: { id: string; qty_shipped: number }[] | null = null
    if (rawItems.length) {
      const { data: items } = await admin
        .from('order_items')
        .select('id,line_no,qty_shipped')
        .eq('order_id', o.id)
        .order('line_no')
      orderItemsList = items ?? []
    }

    const itemsJson = rawItems.map((it: Record<string, unknown>) => {
      const idx = it?.orderItemIndex
      const resolvedItem = Number.isInteger(idx) ? orderItemsList?.[idx as number] : null
      const orderItemId = resolvedItem?.id ?? null
      const submittedQty = Math.max(1, Math.floor(Number(it?.qty) || 1))
      const qty = Math.min(submittedQty, resolvedItem?.qty_shipped || 1)
      return { order_item_id: orderItemId, qty }
    })

    const deadline = new Date(shippedMs + CLAIM_WINDOW_MS).toISOString()
    const { data: claimId, error } = await admin.rpc('create_claim', {
      p_order_id: o.id,
      p_type: p.type,
      p_description: description,
      p_deadline_at: deadline,
      p_items: itemsJson,
    })
    if (error || !claimId) {
      console.error('submit-claim', error)
      return new Response(JSON.stringify({ error: 'ส่งเรื่องไม่สำเร็จ' }), {
        status: 500,
        headers: JSON_HEADERS,
      })
    }

    if (photoKeys.length) {
      await admin
        .from('claim_photos')
        .insert(photoKeys.map((k) => ({ claim_id: claimId, r2_key: k })))
    }
    await admin.from('audit_logs').insert({
      user_id: null,
      action: 'claim_submitted',
      entity_type: 'claim',
      entity_id: claimId,
      meta: { orderId: o.id },
    })

    return new Response(JSON.stringify({ ok: true, claimId }), { headers: JSON_HEADERS })
  } catch (e) {
    // Log server-side only; never echo DB/env error text to the customer.
    console.error('submit-claim', e)
    return new Response(JSON.stringify({ error: 'ส่งเรื่องไม่สำเร็จ' }), {
      status: 500,
      headers: JSON_HEADERS,
    })
  }
})
