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
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// MUST STAY IN SYNC WITH src/lib/credit.ts (Deno cannot import from src/).
function computeCreditSummary(
  totalValue: number,
  items: Array<{ unit_price: unknown; qty_ordered: unknown; status: string }>,
  claims: Array<{ status: string; resolution: string | null; refund_amount: unknown }>,
) {
  const shortageValue = round2(
    items
      .filter((i) => i.status === 'short')
      .reduce((s, i) => s + Number(i.unit_price) * Number(i.qty_ordered), 0),
  )
  const approvedRefund = round2(
    claims
      .filter((c) => c.status === 'approved' && c.resolution === 'refund')
      .reduce((s, c) => s + Number(c.refund_amount), 0),
  )
  const netPayable = Math.max(0, round2(totalValue - shortageValue - approvedRefund))
  return { orderValue: round2(totalValue), shortageValue, approvedRefund, netPayable }
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
      '*, order_items(product_name,qty_ordered,unit_price,status,line_no), evidence_photos(r2_key), claims(id,type,qty,description,status,resolution,created_at,refund_amount), ship_days(boats)',
    )
    .eq('link_token', token)
    .single()
  if (error || !o) return new Response('not found', { status: 404, headers: cors })

  const shippedMs = o.shipped_at ? new Date(o.shipped_at).getTime() : null

  // I3: link expires 48h after the order shipped. Not-yet-shipped orders stay
  // viewable indefinitely. Expired links get the same 404 as an unknown token so
  // the customer page shows its existing "link not found / expired" message.
  if (shippedMs != null && Date.now() - shippedMs > CLAIM_WINDOW_MS) {
    return new Response('not found', { status: 404, headers: cors })
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
    paperBoxCount: o.paper_box_count,
    foamBoxCount: o.foam_box_count,
    items: items.map((i) => ({
      productName: i.product_name,
      qtyOrdered: Number(i.qty_ordered),
      unitPrice: Number(i.unit_price),
      status: i.status,
    })),
    shortages: items
      .filter((i) => i.status === 'short')
      .map((i) => ({ productName: i.product_name, qtyOrdered: Number(i.qty_ordered) })),
    evidencePhotos: ((o.evidence_photos ?? []) as Array<{ r2_key: string }>).map(
      (p) => `${base}/${p.r2_key}`,
    ),
    claimDeadlineAt,
    canClaim,
    credit: computeCreditSummary(
      Number(o.total_value_cached),
      items as Array<{ unit_price: unknown; qty_ordered: unknown; status: string }>,
      claims as Array<{ status: string; resolution: string | null; refund_amount: unknown }>,
    ),
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
