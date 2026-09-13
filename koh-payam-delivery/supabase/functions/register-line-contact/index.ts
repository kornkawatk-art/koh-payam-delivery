// POST { idToken: string, phone: string } -> { ok: true, pending: boolean }
// `pending: true` means the phone already mapped to a DIFFERENT LINE account
// and the request was staged for manager review instead of written straight
// through (feature/line-contact-approval); the old mapping is untouched.
//
// Called once by the customer from the LIFF registration page
// (src/routes/customer/LineRegister.tsx), opened inside LINE's in-app
// browser with no Supabase session. The customer types their phone number;
// the LIFF SDK on the client supplies a LINE ID token for whoever is
// currently logged in to LINE.
//
// We never trust a client-supplied LINE user id: the id token is verified
// server-side against LINE's own verify endpoint (which returns the
// channel-scoped `sub` for the token's owner), and only that verified `sub`
// is stored. This maps phone -> LINE account for send-order-links to later
// auto-send order links over LINE.
//
// THREAT MODEL (why the checks below exist). The mapping this function writes
// decides where a customer's order link — order details, outstanding amount,
// item list, sibling-order tokens, and the ability to file a claim via
// submit-claim, which authenticates on link_token alone — gets delivered. The
// upsert is keyed on phone alone, so a write silently replaces any existing
// correct mapping. A verified LINE identity is cheap (anyone with LINE has
// one), so token verification alone would leave the door open to scripting
// this endpoint across the Thai mobile number space and quietly rerouting
// other people's order links. Three layers narrow that:
//   1. Rate limit per IP (copied from order-view — this codebase already
//      rate-limits a mere READ; an unauthenticated WRITE deserves no less).
//   2. The phone must actually appear on a RECENT order. That kills bulk
//      enumeration outright: only phones that really ordered in the last 30
//      days can be registered at all, and only on an exact (normalized) match.
//   3. Every successful write leaves an audit_logs row, including whether it
//      replaced an existing mapping — there is no UI anywhere showing
//      line_contacts, so without this a hijack would be invisible.
//
// config.toml sets verify_jwt = false: same customer-facing, no-session shape
// as submit-claim and photo-upload-url's claim branch.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors } from '../_shared/cors.ts'
import { normalizePhone } from '../_shared/phone.ts'

const JSON_HEADERS = { ...cors, 'Content-Type': 'application/json' }
const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify'

// How far back an order must be for its phone to still be registerable, and
// how the recent-order scan is paged. The window is a plain 30-day span; a few
// hours of timezone slop at its far edge is irrelevant to what it is for.
const RECENT_DAYS = 30
const SCAN_PAGE = 1000
const SCAN_MAX_PAGES = 5

// Best-effort, in-memory, per-instance rate limit (~60 req/min/IP). NOT durable
// and NOT shared across edge-function instances — a determined caller can still
// get through. Enough to blunt a naive script hammering this endpoint.
// (Same helper as order-view/index.ts; kept a local copy rather than shared so
// each function's budget stays its own.)
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

/**
 * Does `normalized` match the phone on any order shipping within the last
 * RECENT_DAYS? Returns null if the lookup itself failed (caller -> 500; must
 * never be conflated with "no match", which is a 400 the customer can act on).
 *
 * orders.customer_phone is stored exactly as Makro's export had it (buildImport
 * only `.trim()`s it), so both sides go through normalizePhone. The common case
 * — the stored value is already in normalized form — is answered by one indexed
 * equality lookup; only a miss falls back to a paged scan of the window's
 * phones, which is at most a few thousand short strings at this shop's volume.
 */
async function hasRecentOrderForPhone(
  admin: ReturnType<typeof createClient>,
  normalized: string,
  cutoff: string,
): Promise<boolean | null> {
  const { data: exact, error: exactErr } = await admin
    .from('orders')
    .select('id')
    .eq('customer_phone', normalized)
    .gte('ship_date', cutoff)
    .limit(1)
  if (exactErr) return null
  if (exact?.length) return true

  for (let page = 0; page < SCAN_MAX_PAGES; page++) {
    const from = page * SCAN_PAGE
    const { data, error } = await admin
      .from('orders')
      .select('customer_phone')
      .gte('ship_date', cutoff)
      .not('customer_phone', 'is', null)
      .order('ship_date', { ascending: false })
      .range(from, from + SCAN_PAGE - 1)
    if (error) return null
    const rows = (data ?? []) as { customer_phone: string | null }[]
    if (rows.some((r) => normalizePhone(r.customer_phone ?? '') === normalized)) return true
    if (rows.length < SCAN_PAGE) break
  }
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (rateLimited(ip)) return new Response('rate limited', { status: 429, headers: cors })

  try {
    const p = await req.json().catch(() => null)
    const idToken = p?.idToken
    const phone = p?.phone
    if (typeof idToken !== 'string' || !idToken || typeof phone !== 'string' || !phone) {
      return new Response(JSON.stringify({ error: 'idToken และ phone จำเป็นต้องระบุ' }), {
        status: 400,
        headers: JSON_HEADERS,
      })
    }

    // One canonical form for the whole feature (see _shared/phone.ts). Stored
    // normalized so send-order-links' lookup against orders.customer_phone can
    // actually match. A string with no digits at all (whitespace, punctuation)
    // normalizes away to nothing and is rejected here — it would otherwise pass
    // the non-empty check above and write a row that can never match anything.
    const normalizedPhone = normalizePhone(phone)
    if (!normalizedPhone) {
      return new Response(JSON.stringify({ error: 'เบอร์โทรไม่ถูกต้อง' }), {
        status: 400,
        headers: JSON_HEADERS,
      })
    }

    // Verify the id token with LINE itself — this is the only source of
    // truth for the LINE user id. A client could send any idToken/phone pair,
    // so the `sub` we store must come from LINE's response, never the request.
    const channelId = Deno.env.get('LIFF_CHANNEL_ID')!
    const verifyRes = await fetch(LINE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    })
    const verified = await verifyRes.json().catch(() => null)
    if (!verifyRes.ok || !verified?.sub) {
      return new Response(JSON.stringify({ error: 'ยืนยันตัวตน LINE ไม่สำเร็จ' }), {
        status: 401,
        headers: JSON_HEADERS,
      })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // A verified LINE identity proves *who is asking*, not *whose phone this
    // is*. Require the phone to belong to a real, recent customer before
    // letting it be claimed: an attacker is reduced from "the whole 10-digit
    // mobile space" to "phones that actually ordered here in the last 30 days,
    // exact match only".
    const cutoff = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const recent = await hasRecentOrderForPhone(admin, normalizedPhone, cutoff)
    if (recent === null) {
      return new Response(JSON.stringify({ error: 'ลงทะเบียนไม่สำเร็จ' }), {
        status: 500,
        headers: JSON_HEADERS,
      })
    }
    if (!recent) {
      return new Response(
        JSON.stringify({ error: 'ไม่พบเบอร์โทรนี้ในระบบ กรุณาตรวจสอบเบอร์โทรอีกครั้ง' }),
        { status: 400, headers: JSON_HEADERS },
      )
    }

    // Read before write purely so the audit row can say whether this replaced
    // an existing mapping — the one signal that distinguishes a first-time
    // registration from a re-route of someone else's deliveries. Also lets us
    // detect a cross-account overwrite (existing.line_user_id !== verified.sub)
    // so that case can be routed into manager approval instead of writing
    // straight through (feature/line-contact-approval).
    const { data: existing } = await admin
      .from('line_contacts')
      .select('id, line_user_id, display_name')
      .eq('phone', normalizedPhone)
      .maybeSingle()

    const isCrossAccountOverwrite = Boolean(existing) && existing!.line_user_id !== verified.sub

    if (isCrossAccountOverwrite) {
      // A different LINE account is trying to claim a phone that already maps
      // to someone else's LINE account. Don't touch line_user_id/display_name
      // — stage the request for manager review instead, so the old LINE
      // account keeps receiving order links until a manager decides. The
      // pending line_user_id is deliberately left out of the audit meta below:
      // it hasn't been reviewed yet, so recording it here would defeat the
      // point of requiring a manager to look at it live on the page.
      const { error } = await admin
        .from('line_contacts')
        .update({
          pending_line_user_id: verified.sub,
          pending_display_name: verified.name ?? null,
          pending_requested_at: new Date().toISOString(),
        })
        .eq('phone', normalizedPhone)
      if (error) {
        console.error('register-line-contact', error)
        return new Response(JSON.stringify({ error: 'ลงทะเบียนไม่สำเร็จ' }), {
          status: 500,
          headers: JSON_HEADERS,
        })
      }

      await admin.from('audit_logs').insert({
        user_id: null,
        action: 'line_contact_pending_created',
        entity_type: 'line_contact',
        entity_id: normalizedPhone,
        meta: { oldLineUserId: existing!.line_user_id },
      })

      return new Response(JSON.stringify({ ok: true, pending: true }), { headers: JSON_HEADERS })
    }

    const { error } = await admin.from('line_contacts').upsert(
      {
        phone: normalizedPhone,
        line_user_id: verified.sub,
        display_name: verified.name ?? null,
      },
      { onConflict: 'phone' },
    )
    if (error) {
      console.error('register-line-contact', error)
      return new Response(JSON.stringify({ error: 'ลงทะเบียนไม่สำเร็จ' }), {
        status: 500,
        headers: JSON_HEADERS,
      })
    }

    // line_contacts has no FK to anything and no UI anywhere, so the phone
    // itself is the only stable id to reference. Same shape as submit-claim's
    // audit row (user_id null: this is a customer action, not a team one).
    await admin.from('audit_logs').insert({
      user_id: null,
      action: 'line_contact_registered',
      entity_type: 'line_contact',
      entity_id: normalizedPhone,
      meta: { replacedExisting: Boolean(existing) },
    })

    return new Response(JSON.stringify({ ok: true, pending: false }), { headers: JSON_HEADERS })
  } catch (e) {
    // Log server-side only; never echo DB/env error text to the customer.
    console.error('register-line-contact', e)
    return new Response(JSON.stringify({ error: 'ลงทะเบียนไม่สำเร็จ' }), {
      status: 500,
      headers: JSON_HEADERS,
    })
  }
})
