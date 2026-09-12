// POST { idToken: string, phone: string } -> { ok: true }
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
// is stored. This maps phone -> LINE account for task 2 (not this function)
// to later auto-send order links over LINE.
//
// config.toml sets verify_jwt = false: same customer-facing, no-session shape
// as submit-claim and photo-upload-url's claim branch.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors } from '../_shared/cors.ts'

const JSON_HEADERS = { ...cors, 'Content-Type': 'application/json' }
const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors })
  }

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

    const { error } = await admin.from('line_contacts').upsert(
      {
        phone,
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

    return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS })
  } catch (e) {
    // Log server-side only; never echo DB/env error text to the customer.
    console.error('register-line-contact', e)
    return new Response(JSON.stringify({ error: 'ลงทะเบียนไม่สำเร็จ' }), {
      status: 500,
      headers: JSON_HEADERS,
    })
  }
})
