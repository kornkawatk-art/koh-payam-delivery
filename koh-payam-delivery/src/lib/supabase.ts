import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { withExpiredJwtRetry } from './jwtRetry'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
if (!url || !anon) throw new Error('ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')

// Explicitly typed: the refresh callback below refers back to `supabase`,
// which would otherwise make its inferred type circular (any).
export const supabase: SupabaseClient = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
  global: {
    // Data requests (PostgREST etc.) sent with an access token the server
    // considers expired -- a device clock running behind makes supabase-js
    // skip the refresh -- are refreshed once and retried. See jwtRetry.ts.
    fetch: withExpiredJwtRetry(
      (input, init) => fetch(input, init),
      async () => {
        const { data } = await supabase.auth.refreshSession()
        return data.session?.access_token ?? null
      },
    ),
  },
})
