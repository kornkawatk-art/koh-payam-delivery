// GET  /order-view?token=<link_token>
// POST /order-view   { token }
//   -> sanitized customer-facing order JSON (see shape below).
//
// config.toml sets verify_jwt = false: customers open this from an emailed link
// with no Supabase session. The `link_token` is the only credential.
//
// The response MUST NOT leak: the order `id`, `link_token`, any team/profile
// data, refund_amount, or audit rows.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors } from '../_shared/cors.ts'

const JSON_HEADERS = { ...cors, 'Content-Type': 'application/json' }
const CLAIM_WINDOW_MS = 48 * 60 * 60 * 1000

// I3: an order's link is valid until 48h after it shipped. Not-yet-shipped
// orders (shippedAt == null) stay valid indefinitely. Shared by the primary
// order's expiry check and by the sibling-order filter below so the two
// never drift apart.
function isLinkValid(shippedAt: string | null): boolean {
  const shippedMs = shippedAt ? new Date(shippedAt).getTime() : null
  return shippedMs == null || Date.now() - shippedMs <= CLAIM_WINDOW_MS
}

// Best-effort, in-memory, per-instance rate limit (~60 req/min/IP). NOT durable
// and NOT shared across edge-function instances — a determined caller can still
// get through. Enough to blunt a naive scraper hammering one token.
const RL_MAX = 60
const RL_WINDOW_MS = 60_000
const rl = new Map<string, { count: number; resetAt: number }>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rl.get(ip)
  if (!entry || now > entry.resetAt) {
    rl.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > RL_MAX
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (rateLimited(ip)) return new Response('rate limited', { status: 429, headers: cors })

  const url = new URL(req.url)
  let token: string | null = url.searchParams.get('token')
  if (!token && req.method === 'POST') {
    try {
      token = (await req.json())?.token ?? null
    } catch {
      token = null
    }
  }
  if (!token) return new Response('token required', { status: 400, headers: cors })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: o, error } = await admin
    .from('orders')
    .select(
      '*, order_items(product_name,makro_item_id,qty_ordered,qty_shipped,shortage_qty,status,line_no), evidence_photos(r2_key,taken_at), claims(id,type,qty,description,status,resolution,created_at,refund_amount), ship_days(boats)',
    )
    .eq('link_token', token)
    .single()
  if (error || !o) return new Response('not found', { status: 404, headers: cors })

  const shippedMs = o.shipped_at ? new Date(o.shipped_at).getTime() : null

  // I3: link expires 48h after the order shipped. Not-yet-shipped orders stay
  // viewable indefinitely. Expired links get the same 404 as an unknown token so
  // the customer page shows its existing "link not found / expired" message.
  if (!isLinkValid(o.shipped_at)) {
    return new Response('not found', { status: 404, headers: cors })
  }

  // Customer grouping: sibling orders are POs that share this customer's phone
  // number and the same ship date — one purchase split across multiple Makro
  // orders that ship together. The requester already holds a valid, unexpired
  // token proving they are this phone number's customer, so surfacing sibling
  // tokens for orders sharing that same phone+day is the point of this
  // feature. Only orders that would themselves pass the same not-expired
  // check are included. customer_phone itself is never put in the response.
  let siblingOrders: { orderNo: string; status: string; token: string }[] = []
  if (o.customer_phone) {
    const { data: siblings } = await admin
      .from('orders')
      .select('makro_order_no,status,shipped_at,link_token')
      .eq('customer_phone', o.customer_phone)
      .eq('ship_date', o.ship_date)
      .neq('id', o.id)
    siblingOrders = ((siblings ?? []) as Array<Record<string, unknown>>)
      .filter((s) => isLinkValid(s.shipped_at as string | null))
      .map((s) => ({
        orderNo: s.makro_order_no as string,
        status: s.status as string,
        token: s.link_token as string,
      }))
  }

  const base = Deno.env.get('R2_PUBLIC_BASE_URL')
  const boats = (o.ship_days?.boats ?? []) as Array<{ id: string; name: string }>
  const boat = boats.find((b) => b.id === o.boat_id)
  const canClaim =
    o.status === 'shipped' && shippedMs != null && Date.now() - shippedMs <= CLAIM_WINDOW_MS
  const claimDeadlineAt = shippedMs != null ? new Date(shippedMs + CLAIM_WINDOW_MS).toISOString() : null

  // Order by line_no so the customer form's `orderItemIndex` lines up with the
  // same ordering submit-claim uses to resolve it back to an order_items row.
  const items = ((o.order_items ?? []) as Array<Record<string, unknown>>)
    .slice()
    .sort((a, b) => Number(a.line_no) - Number(b.line_no))
  const claims = (o.claims ?? []) as Array<Record<string, unknown>>

  const body = {
    orderNo: o.makro_order_no,
    customerNameEn: o.customer_name_en,
    shipDate: o.ship_date,
    status: o.status,
    boatName: boat?.name ?? null,
    siblingOrders,
    paperBoxCount: o.paper_box_count,
    foamBoxCount: o.foam_box_count,
    // Amount only — payment_method/payment_status stay internal (Q3a/Q8).
    outstandingAmount: o.outstanding_amount > 0 ? Number(o.outstanding_amount) : null,
    items: items.map((i) => ({
      productName: i.product_name,
      itemId: i.makro_item_id ?? null,
      orderedQty: Number(i.qty_ordered),
      shippedQty: Number(i.qty_shipped),
      isShort: i.status === 'short',
    })),
    shortages: items
      .filter((i) => i.status === 'short')
      .map((i) => ({
        productName: i.product_name,
        orderedQty: Number(i.qty_ordered),
        shippedQty: Number(i.qty_shipped),
      })),
    // Both stages ('pack' and 'handoff') are shown to the customer, oldest
    // first so the pack shots precede the pier hand-off shots.
    evidencePhotos: ((o.evidence_photos ?? []) as Array<{ r2_key: string; taken_at: string | null }>)
      .slice()
      .sort((a, b) => new Date(a.taken_at ?? 0).getTime() - new Date(b.taken_at ?? 0).getTime())
      .map((p) => `${base}/${p.r2_key}`),
    claimDeadlineAt,
    canClaim,
    claims: claims.map((c) => ({
      id: c.id,
      type: c.type,
      qty: Number(c.qty),
      // I7: never leak internal team notes. ClaimDetail appends manager notes as
      // lines prefixed with `[ทีม] `; strip those, keep the customer's own text.
      description: String(c.description ?? '')
        .split('\n')
        .filter((line) => !line.startsWith('[ทีม]'))
        .join('\n')
        .trim(),
      status: c.status,
      resolution: c.resolution,
      createdAt: c.created_at,
    })),
  }
  return new Response(JSON.stringify(body), { headers: JSON_HEADERS })
})
