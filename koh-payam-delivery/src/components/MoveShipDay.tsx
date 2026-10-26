import { useState } from 'react'
import { CalendarBlank } from '@phosphor-icons/react'
import { moveOrdersToDay, type MovableOrder } from '../lib/api/moveShipDay'
import { canMoveShipDay, nextDayISO, shipDayTargetError } from '../lib/postponed'
import { todayLocalISO } from '../lib/format'

/**
 * "เลื่อนวันส่ง" (manager / online team): move these orders -- one PO, or every PO a customer has
 * that day -- to a later ship day with a short reason. Hidden once they have gone out.
 */
export function MoveShipDay({
  orders,
  onMoved,
  today = todayLocalISO(),
}: {
  orders: MovableOrder[]
  onMoved: (toDate: string) => void
  today?: string
}) {
  const tomorrow = nextDayISO(today)
  const [open, setOpen] = useState(false)
  const [day, setDay] = useState(tomorrow)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()

  if (orders.length === 0 || !orders.every((o) => canMoveShipDay(o.status))) return null
  const dayErr = orders.map((o) => shipDayTargetError(day, o.ship_date, today)).find(Boolean) ?? null

  async function move() {
    setBusy(true)
    setErr(undefined)
    try {
      await moveOrdersToDay(orders, day, reason, today)
      setOpen(false)
      onMoved(day)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!open)
    return (
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        <CalendarBlank size={16} aria-hidden="true" />
        เลื่อนวันส่ง
      </button>
    )

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <input
        type="date"
        className="w-auto"
        aria-label="วันส่งใหม่"
        min={tomorrow}
        value={day}
        onChange={(e) => setDay(e.target.value)}
      />
      <input
        className="min-w-0 flex-1"
        aria-label="เหตุผลที่เลื่อน"
        placeholder="เหตุผล เช่น รอลูกค้าโอน"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={busy || !reason.trim() || !!dayErr}
        onClick={() => void move()}
      >
        {busy ? 'กำลังเลื่อน…' : 'ยืนยันเลื่อน'}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
        ยกเลิก
      </button>
      {orders.length > 1 && <span className="w-full text-xs text-ink-soft">เลื่อนทั้ง {orders.length} ออเดอร์ของลูกค้านี้</span>}
      {dayErr && <span className="w-full text-xs text-danger-ink">{dayErr}</span>}
      {err && <span className="w-full text-sm text-danger-ink">{err}</span>}
    </div>
  )
}
