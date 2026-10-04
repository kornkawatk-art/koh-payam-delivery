import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { getNavCounts, type NavCounts } from './api/navCounts'
import { todayLocalISO } from './format'
import type { Role } from './roles'

/**
 * Live menu badges: refetched whenever orders / claims / LINE registrations
 * change (realtime), on every page change, and when the tab regains focus
 * (which also rolls "today" over after midnight).
 */
export function useNavCounts(role: Role, pathname: string): NavCounts {
  const [counts, setCounts] = useState<NavCounts>({})
  const [today, setToday] = useState(todayLocalISO())
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const refresh = useRef<() => void>(() => {})
  refresh.current = () => {
    const d = todayLocalISO()
    if (d !== today) setToday(d)
    getNavCounts(role, d)
      .then(setCounts)
      .catch(() => {}) // keep the last badges rather than flashing them away
  }

  // A burst of changes (an import, a group ship) refetches once.
  const soon = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => refresh.current(), 400)
  }

  useEffect(() => {
    refresh.current()
  }, [role, pathname])

  useEffect(() => {
    const onFocus = () => refresh.current()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    let ch = supabase
      .channel(`nav-counts-${today}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `ship_date=eq.${today}` },
        soon,
      )
    if (role === 'manager')
      ch = ch
        .on('postgres_changes', { event: '*', schema: 'public', table: 'claims' }, soon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'line_contacts' }, soon)
    ch.subscribe()
    return () => {
      clearTimeout(timer.current)
      supabase.removeChannel(ch)
    }
  }, [role, today])

  return counts
}
