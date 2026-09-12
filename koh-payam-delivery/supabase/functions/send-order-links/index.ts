// POST { shipDate: string } -> { ok: true, sent: number, failed: number, skipped: boolean }
//
// Called by BoatSetup.tsx (via src/lib/api/shipDays.ts's sendOrderLinks) right
// after a team member saves that day's boat list, from an authenticated team
// session — the FIRST edge function in this codebase meant for that caller
// shape instead of a customer link. Unlike every other function here, it has
// NO [functions.send-order-links] entry in config.toml: leaving it out keeps
// verify_jwt at its default `true`, so the Supabase gateway itself rejects
// the request before this code ever runs if the bearer isn't a real, valid
// Supabase session (see the comment above [functions.order-view] in
// config.toml explaining why the *other* functions there are set to false —
// this one deliberately isn't in that list at all). The profiles/is_active
// check below is defense-in-depth on top of that gateway check, not a
// replacement for it: verify_jwt only proves the session is real, not that
// the account is still an active team member (mirrors public.is_team_member(),
// done here in TypeScript since RLS can't gate an edge function's own
// business logic).
//
// Algorithm (see the plan's Global Constraints section):
//   1. Idempotency guard: ship_days.links_sent_at already set for this day ->
//      no-op, { ok: true, sent: 0, failed: 0, skipped: true }.
//   2. Load every order shipping that day (id, customer_name_en,
//      customer_phone, link_token).
//   3. Dedup by phone (dedupOrdersByPhone, dedup.ts) — one message per
//      customer even with several same-day POs.
//   4. For each deduped order whose phone has a line_contacts row, push a
//      LINE text message with that order's link. No matching row -> skipped;
//      the existing manual "คัดลอก" button on OrderDetail.tsx stays the
//      fallback for a customer who hasn't done the one-time LINE
//      registration yet.
//   5. Each push is independent: one recipient's failure (e.g. they blocked
//      the OA) must never abort the rest of the batch.
//   6. After the loop — regardless of any individual failures — set
//      ship_days.links_sent_at = now(). A partial-failure run still counts
//      as "attempted for today"; it must not retry-storm on every later
//      same-day setBoats save.
//   7. Return { ok: true, sent, failed, skipped: false }.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors } from '../_shared/cors.ts'
import { dedupOrdersByPhone } from './dedup.ts'

const JSON_HEADERS = { ...cors, 'Content-Type': 'application/json' }
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push'

type OrderForLink = {
  id: string
  customer_name_en: string
  customer_phone: string | null
  link_token: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors })
  }

  try {
    const p = await req.json().catch(() => null)
    const shipDate = p?.shipDate
    if (typeof shipDate !== 'string' || !shipDate) {
      return new Response(JSON.stringify({ error: 'shipDate จำเป็นต้องระบุ' }), {
        status: 400,
        headers: JSON_HEADERS,
      })
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return new Response('unauthorized', { status: 401, headers: cors })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    // Resolves *who* the already-gateway-validated session belongs to (does
    // not itself re-validate the JWT signature — verify_jwt already did that).
    const anon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: userData, error: userErr } = await anon.auth.getUser(jwt)
    if (userErr || !userData?.user) {
      return new Response('unauthorized', { status: 401, headers: cors })
    }

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Defense-in-depth (see file header): confirm the caller is still an
    // *active* team member, mirroring public.is_team_member().
    const { data: profile } = await admin
      .from('profiles')
      .select('is_active')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (!profile?.is_active) {
      return new Response(JSON.stringify({ error: 'ไม่มีสิทธิ์เข้าถึง' }), {
        status: 403,
        headers: JSON_HEADERS,
      })
    }

    // Step 1: idempotency guard.
    const { data: shipDay, error: shipDayErr } = await admin
      .from('ship_days')
      .select('id,links_sent_at')
      .eq('ship_date', shipDate)
      .maybeSingle()
    if (shipDayErr || !shipDay) {
      return new Response(JSON.stringify({ error: 'ไม่พบรอบจัดส่งวันนี้' }), {
        status: 404,
        headers: JSON_HEADERS,
      })
    }
    if (shipDay.links_sent_at) {
      return new Response(JSON.stringify({ ok: true, sent: 0, failed: 0, skipped: true }), {
        headers: JSON_HEADERS,
      })
    }

    // Step 2: load every order shipping that day.
    const { data: orders, error: ordersErr } = await admin
      .from('orders')
      .select('id,customer_name_en,customer_phone,link_token')
      .eq('ship_date', shipDate)
    if (ordersErr) {
      console.error('send-order-links load orders', ordersErr)
      return new Response(JSON.stringify({ error: 'โหลดออเดอร์ไม่สำเร็จ' }), {
        status: 500,
        headers: JSON_HEADERS,
      })
    }

    // Step 3: one message per customer, even with several same-day POs.
    const deduped = dedupOrdersByPhone((orders ?? []) as OrderForLink[])

    let sent = 0
    let failed = 0

    if (deduped.length) {
      const phones = deduped.map((o) => o.customer_phone!) as string[]
      const { data: contacts, error: contactsErr } = await admin
        .from('line_contacts')
        .select('phone,line_user_id')
        .in('phone', phones)
      if (contactsErr) {
        // Can't look up who's registered — nothing below can send, but this
        // must not throw: links_sent_at still gets set at the end (step 6),
        // same as any other partial-failure run.
        console.error('send-order-links load line_contacts', contactsErr)
      }
      const contactByPhone = new Map(
        (contacts ?? []).map((c: { phone: string; line_user_id: string }) => [
          c.phone,
          c.line_user_id,
        ]),
      )

      const channelToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? ''
      const site = Deno.env.get('SITE_URL') ?? ''

      // Steps 4+5: push per recipient, independently — one bad send must
      // never abort the batch.
      for (const o of deduped) {
        const lineUserId = contactByPhone.get(o.customer_phone!)
        if (!lineUserId) continue // not registered yet -- "คัดลอก" stays the fallback

        try {
          const text = `ออเดอร์ของคุณพร้อมส่งแล้ว ติดตามได้ที่: ${site}/o/${o.link_token}`
          const res = await fetch(LINE_PUSH_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${channelToken}`,
            },
            body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
          })
          if (!res.ok) throw new Error(`line push responded ${res.status}`)
          sent += 1
        } catch (e) {
          failed += 1
          // Log enough to investigate (order id, phone) — never the response
          // body or the channel token, which could carry anything sensitive.
          console.error('send-order-links push failed', {
            orderId: o.id,
            phone: o.customer_phone,
            error: (e as Error).message,
          })
        }
      }
    }

    // Step 6: always mark this ship day as attempted, even after partial
    // failures — a later same-day setBoats save must not retry-storm.
    await admin
      .from('ship_days')
      .update({ links_sent_at: new Date().toISOString() })
      .eq('id', shipDay.id)

    return new Response(JSON.stringify({ ok: true, sent, failed, skipped: false }), {
      headers: JSON_HEADERS,
    })
  } catch (e) {
    console.error('send-order-links', e)
    return new Response(JSON.stringify({ error: 'ส่งลิงก์ไม่สำเร็จ' }), {
      status: 500,
      headers: JSON_HEADERS,
    })
  }
})
