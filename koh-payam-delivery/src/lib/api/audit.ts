import { supabase } from '../supabase'

// Best-effort audit trail. This must never disrupt the caller's main flow, so
// every failure path (thrown or returned error) is swallowed to console.warn.
// Call it only AFTER the primary DB write has succeeded.
export async function logAction(
  action: string,
  entityType: string,
  entityId: string,
  meta?: object,
): Promise<void> {
  try {
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('audit_logs').insert({
      user_id: u.user?.id ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      meta: meta ?? null,
    })
    if (error) console.warn('audit log failed', error)
  } catch (e) {
    console.warn('audit log failed', e)
  }
}
