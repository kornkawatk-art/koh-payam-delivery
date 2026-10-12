import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CaretDown, CaretRight, Money } from '@phosphor-icons/react'
import { PageHeader } from '../../components/ui/PageHeader'
import { PageSkeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { Notice, flash, type Flash } from '../../components/ui/Notice'
import { formatDateTH, formatTHB, todayLocalISO } from '../../lib/format'
import { daysOwed, type CustomerDebt } from '../../lib/payments'
import {
  listCustomerDebts,
  listReleasedKeys,
  markBillPaid,
  releaseCustomer,
} from '../../lib/api/payments'

/**
 * ยอดค้างชำระ: every customer owing a cash-on-delivery bill, oldest first.
 * Managers mark a bill paid or release a locked customer for today's delivery
 * (spec docs/superpowers/specs/2026-10-12-payment-lock-design.md).
 */
export default function Debts() {
  const today = todayLocalISO()
  // undefined = loading, null = load failed
  const [debts, setDebts] = useState<CustomerDebt[] | null | undefined>(undefined)
  const [released, setReleased] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<Flash>()

  const load = useCallback(() => {
    Promise.all([listCustomerDebts(), listReleasedKeys(today)])
      .then(([d, r]) => {
        setDebts(d)
        setReleased(r)
      })
      .catch(() => setDebts(null))
  }, [today])
  useEffect(load, [load])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (debts ?? []).filter(
      (d) => !s || d.name.toLowerCase().includes(s) || (d.phone ?? '').includes(s),
    )
  }, [debts, q])

  const header = <PageHeader title="ยอดค้างชำระ" icon={Money} />
  if (debts === undefined) return <PageSkeleton rows={6} />
  if (debts === null)
    return (
      <div className="flex flex-col gap-4">
        {header}
        <p className="alert alert-danger">โหลดยอดค้างชำระไม่สำเร็จ</p>
      </div>
    )

  const total = debts.reduce((n, d) => n + d.total, 0)

  return (
    <div className="flex flex-col gap-4">
      {header}
      <p className="text-sm text-ink-soft">
        ลูกค้าค้างจ่าย {debts.length} ราย · ยอดค้างรวม{' '}
        <strong className="num text-ink">{formatTHB(total)}</strong>
      </p>
      <input
        className="min-w-0"
        placeholder="ค้นหาชื่อหรือเบอร์"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <Notice flash={msg} />
      {shown.length === 0 ? (
        <EmptyState icon={Money} title="ไม่มีลูกค้าค้างชำระ" />
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((d) => (
            <DebtRow
              key={d.key}
              d={d}
              today={today}
              releasedToday={released.has(d.key)}
              onDone={(text) => {
                setMsg(flash.ok(text))
                load()
              }}
              onError={(text) => setMsg(flash.error(text))}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function DebtRow({
  d,
  today,
  releasedToday,
  onDone,
  onError,
}: {
  d: CustomerDebt
  today: string
  releasedToday: boolean
  onDone: (text: string) => void
  onError: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true)
    try {
      await fn()
      onDone(ok)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const Caret = open ? CaretDown : CaretRight
  return (
    <li className="card flex flex-col gap-2 p-3">
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Caret size={16} aria-hidden="true" />
        <span className="font-medium">{d.name}</span>
        {d.phone && <span className="num text-sm text-ink-soft">{d.phone}</span>}
        <span className="text-sm">{d.bills.length} บิล</span>
        <strong className="num">{formatTHB(d.total)}</strong>
        <span className="text-sm text-ink-soft">ค้าง {d.oldestDays} วัน</span>
        {d.lockedToday &&
          (releasedToday ? (
            <span className="badge badge-warn">ปลดแล้ววันนี้</span>
          ) : (
            <span className="badge badge-danger">ล็อกแพ็ค</span>
          ))}
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-line pt-2">
          <ul className="flex flex-col gap-1.5">
            {d.bills.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Link to={`/order/${b.id}`} className="num font-medium underline">
                  {b.makro_order_no}
                </Link>
                <span>ส่ง {formatDateTH(b.ship_date)}</span>
                <span className="num">{formatTHB(Number(b.outstanding_amount))}</span>
                <span className="text-ink-soft">{daysOwed(b.ship_date, today)} วัน</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm ml-auto"
                  disabled={busy}
                  onClick={() => void run(() => markBillPaid(b.id), `บันทึกรับเงินบิล ${b.makro_order_no} แล้ว`)}
                >
                  รับเงินแล้ว
                </button>
              </li>
            ))}
          </ul>
          {d.lockedToday && !releasedToday && (
            <div className="flex flex-wrap items-center gap-2">
              {!releasing ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReleasing(true)}>
                  ปลดให้แพ็ค
                </button>
              ) : (
                <>
                  <input
                    className="min-w-0 flex-1"
                    aria-label="เหตุผลที่ปลด"
                    placeholder="เหตุผล เช่น ลูกค้าโอนแล้ว รอแม็คโครอัปเดต"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy || !reason.trim()}
                    onClick={() =>
                      void run(
                        () =>
                          releaseCustomer(
                            { customer_phone: d.phone, customer_name_en: d.name },
                            today,
                            reason,
                          ),
                        `ปลดให้แพ็ค ${d.name} สำหรับรอบส่งวันนี้แล้ว`,
                      )
                    }
                  >
                    ยืนยันปลด
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReleasing(false)}>
                    ยกเลิก
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}
