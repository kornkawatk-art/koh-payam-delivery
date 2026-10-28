// Stands in for src/lib/supabase.ts inside the auto-import bundle: the app code calls
// `supabase.from(...)` as usual, and gets the function's service-role client, which
// index.ts sets before the first call.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, key) {
    const c = (globalThis as { __autoImportClient?: SupabaseClient }).__autoImportClient
    if (!c) throw new Error('auto-import: client not set')
    const v = (c as unknown as Record<PropertyKey, unknown>)[key]
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(c) : v
  },
})
