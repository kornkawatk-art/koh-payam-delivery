import { supabase } from '../supabase'
import type { Role } from '../roles'

/** Outstanding work per menu path; a path with nothing waiting is left out. */
export type NavCounts = Partial<Record<string, number>>

async function count(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: n, error } = await q
  if (error) throw error
  return n ?? 0
}

/**
 * The menu badges. Each count follows who sees that menu (roles.ts):
 * - "/"              today's orders not packed yet (store pickups excluded)
 * - "/pier"          today's packed orders not on a boat yet (pickups excluded)
 * - "/claims"        every claim still open (undecided), whatever its date
 * - "/line-contacts" LINE registrations waiting for approval
 */
export async function getNavCounts(role: Role, today: string): Promise<NavCounts> {
  const todays = () =>
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('ship_date', today)
      .eq('is_pickup', false)

  const jobs: [string, Promise<number>][] = [['/', count(todays().eq('status', 'imported'))]]
  if (role === 'pier' || role === 'manager')
    jobs.push(['/pier', count(todays().in('status', ['packed', 'at_pier']))])
  if (role === 'manager') {
    jobs.push([
      '/claims',
      count(supabase.from('claims').select('id', { count: 'exact', head: true }).eq('status', 'open')),
    ])
    jobs.push([
      '/line-contacts',
      count(
        supabase
          .from('line_contacts')
          .select('phone', { count: 'exact', head: true })
          .not('pending_line_user_id', 'is', null),
      ),
    ])
  }

  const out: NavCounts = {}
  // One failing count must not blank the others -- it just shows no badge.
  const settled = await Promise.allSettled(jobs.map(([, p]) => p))
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value > 0) out[jobs[i][0]] = r.value
  })
  return out
}

/** Paths whose badge means "a manager must decide" -- red, and lights the mobile menu dot. */
export const URGENT_NAV_PATHS = ['/claims', '/line-contacts']
