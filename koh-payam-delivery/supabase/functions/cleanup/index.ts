// R2 delete-queue drainer. Called server-to-server by pg_cron (see the
// r2-cleanup cron in docs/ops-runbook-th.md), NOT from a browser and NOT with a
// Supabase JWT — config.toml sets verify_jwt = false and auth is the shared
// secret below.
//
// Flow: read `r2_delete_queue` in batches of 100, issue a signed DELETE to R2
// for each `r2_key`, then delete the rows that succeeded. Repeat until the queue
// is empty or the per-invocation bounds are hit.
//
// Auth: header `x-cleanup-secret` must equal Deno.env.get('CLEANUP_SECRET')
// (set as a Supabase function secret by the controller). Missing/wrong -> 401.
//
// Per-key R2 failure: logged, the queue row is left in place, the rest continue.
// Response: { ok: true, processed, failed }.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { deleteR2Object } from '../_shared/r2.ts'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

const BATCH_SIZE = 100
const MAX_BATCHES = 50 // ~5000 keys / invocation — bounds runtime

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: JSON_HEADERS })
  }

  const secret = Deno.env.get('CLEANUP_SECRET')
  if (!secret || req.headers.get('x-cleanup-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: JSON_HEADERS,
    })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let processed = 0
  let failed = 0

  try {
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const { data: rows, error } = await admin
        .from('r2_delete_queue')
        .select('id,r2_key')
        .order('id')
        .limit(BATCH_SIZE)
      if (error) throw error
      if (!rows || rows.length === 0) break

      const doneIds: number[] = []
      for (const row of rows) {
        try {
          const res = await deleteR2Object(row.r2_key)
          // R2 returns 204 on delete; 404 means the object is already gone —
          // both let us drop the queue row.
          if (res.ok || res.status === 404) {
            doneIds.push(row.id)
            processed++
          } else {
            failed++
            console.error('cleanup: R2 DELETE failed', row.r2_key, res.status)
          }
        } catch (e) {
          failed++
          console.error('cleanup: R2 DELETE threw', row.r2_key, e)
        }
      }

      if (doneIds.length) {
        const { error: delErr } = await admin
          .from('r2_delete_queue')
          .delete()
          .in('id', doneIds)
        if (delErr) throw delErr
      }

      // No row in this batch could be deleted from R2 — stop rather than
      // re-fetch the same failing rows until MAX_BATCHES.
      if (doneIds.length === 0) break
      // Fewer rows than a full batch means the queue is now drained.
      if (rows.length < BATCH_SIZE) break
    }

    return new Response(JSON.stringify({ ok: true, processed, failed }), { headers: JSON_HEADERS })
  } catch (e) {
    console.error('cleanup', e)
    return new Response(JSON.stringify({ ok: false, processed, failed, error: 'cleanup failed' }), {
      status: 500,
      headers: JSON_HEADERS,
    })
  }
})
