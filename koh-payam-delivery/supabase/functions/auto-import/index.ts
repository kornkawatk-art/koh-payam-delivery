// auto-import: the hourly AO bot (Makro Ranong Data/auto_update/) sends the two Makro exports here,
// already read into rows (header -> cell text, the same rows the นำเข้าออเดอร์ screen reads), and
// they are imported for today and tomorrow (src/lib/import/autoImport.ts, bundled into bundle.js).
//
// POST, header x-auto-import-secret: <AUTO_IMPORT_SECRET>, body gzip JSON { orders: [...], details: [...] }
// -> { ok, report } | { ok: false, error }
// Deployed with --no-verify-jwt: the bot has no Supabase session; the secret is checked here instead.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { autoImport } from './bundle.js'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Today in Thai time, YYYY-MM-DD */
const bangkokToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)
  const secret = Deno.env.get('AUTO_IMPORT_SECRET')
  if (!secret || req.headers.get('x-auto-import-secret') !== secret) return json({ ok: false, error: 'unauthorized' }, 401)

  let body: { orders?: Record<string, string>[]; details?: Record<string, string>[] }
  try {
    const stream = req.headers.get('content-encoding') === 'gzip' ? req.body!.pipeThrough(new DecompressionStream('gzip')) : req.body
    body = await new Response(stream).json()
  } catch {
    return json({ ok: false, error: 'อ่านข้อมูลที่ส่งมาไม่ได้' }, 400)
  }
  if (!Array.isArray(body.orders) || !Array.isArray(body.details) || !body.orders.length || !body.details.length)
    return json({ ok: false, error: 'ต้องมีทั้งไฟล์ OrderExport และ OrderDetailExport' }, 400)

  ;(globalThis as Record<string, unknown>).__autoImportClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  try {
    return json({ ok: true, report: await autoImport(body.details, body.orders, bangkokToday()) })
  } catch (e) {
    console.error('auto-import failed', e)
    return json({ ok: false, error: (e as Error).message }, 500)
  }
})
