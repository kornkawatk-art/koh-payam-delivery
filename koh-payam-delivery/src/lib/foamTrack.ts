// Following up on foam boxes (the ลังโฟม page): how long a customer has held
// boxes, and the balance after every step. Same rules as foamBalance: a ship
// adds, a return takes away (never below 0), a set-balance replaces.
import { sortFoamEvents, type FoamEvent } from '../../supabase/functions/_shared/foamBalance'

const DAY = 24 * 60 * 60 * 1000

/** Held for more than this many days = red. */
export const LONG_HELD_DAYS = 14

export type TimelineEvent = FoamEvent & { after: number }

/** Every event in order, with the balance right after it. */
export function foamTimeline(events: FoamEvent[]): TimelineEvent[] {
  let balance = 0
  return sortFoamEvents(events).map((e) => {
    balance = e.kind === 'sent' ? balance + e.qty : e.kind === 'return' ? Math.max(0, balance - e.qty) : e.qty
    return { ...e, after: balance }
  })
}

/**
 * When the oldest box still out was sent. Returns use up the oldest boxes
 * first; a set-balance counts its boxes as held from that moment.
 */
export function oldestHeldAt(events: FoamEvent[]): string | null {
  let held: { at: string; qty: number }[] = []
  for (const e of sortFoamEvents(events)) {
    if (e.kind === 'sent') held.push({ at: e.at, qty: e.qty })
    else if (e.kind === 'set') held = e.qty > 0 ? [{ at: e.at, qty: e.qty }] : []
    else {
      let left = e.qty
      while (left > 0 && held.length) {
        const take = Math.min(left, held[0].qty)
        held[0].qty -= take
        left -= take
        if (held[0].qty === 0) held.shift()
      }
    }
  }
  return held[0]?.at ?? null
}

/** Whole days the oldest box has been out; null when nothing is held. */
export function heldDays(events: FoamEvent[], now: number = Date.now()): number | null {
  const at = oldestHeldAt(events)
  return at ? Math.floor((now - Date.parse(at)) / DAY) : null
}

/** 0-7 days grey, 8-14 amber, over 14 red. */
export const heldTone = (days: number) =>
  days > LONG_HELD_DAYS ? 'badge-danger' : days > 7 ? 'badge-warn' : 'badge-neutral'

export function lastReturnAt(events: FoamEvent[]): string | null {
  const r = sortFoamEvents(events).filter((e) => e.kind === 'return')
  return r.length ? r[r.length - 1].at : null
}

/** Boxes returned at or after `since`, across many customers' events. */
export function returnedSince(eventLists: FoamEvent[][], since: number): number {
  let n = 0
  for (const list of eventLists)
    for (const e of list) if (e.kind === 'return' && Date.parse(e.at) >= since) n += e.qty
  return n
}
