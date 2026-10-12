import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CaretDown, CaretRight, LockSimple, Money } from '@phosphor-icons/react'
import { PageHeader } from '../../components/ui/PageHeader'
import { PageSkeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { Notice, flash, type Flash } from '../../components/ui/Notice'
import { StatTile } from '../../components/ui/Stat'
import { formatDateTH, formatTHB, todayLocalISO } from '../../lib/format'
import { daysOwed, type CustomerDebt } from '../../lib/payments'
import {
  listCustomerDebts,
  listReleasedKeys,
  markBillPaid,
  releaseCustomer,
} from '../../lib/api/payments'

type Filter = 'all' | 'over7' | 'released'
type Sort = 'oldest' | 'largest'

/** Owed for more than this many days = red ("ค้างเกิน 7 วัน"). */
const LONG_DAYS = 7

/** How urgent a debt this old is: 0-3 days grey, 4-7 amber, over 7 red. */
const ageTone = (days: number) =>
  days > LONG_DAYS ? 'badge-danger' : days >= 4 ? 'badge-warn' : 'badge-neutral'

function AgeBadge({ days }: { days: number }) {
  return <span className={`badge ${ageTone(days)}`}>ค้าง {days} วัน</span>
}

// Shared column layout for the header and each row (desktop only; phones stack).
const COLS = 'sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_9rem_7.5rem_8rem_1rem] sm:items-center sm:gap-x-4'

/**
 * ยอดค้างชำระ: every customer owing a cash-on-delivery bill. A summary on top,
 * filters and sorting, then one row per customer (oldest first by default);
 * open a row to see each bill, mark one paid, or release the customer for
 * today's delivery (spec docs/superpowers/specs/2026-10-12-payment-lock-design.md).
 */
export default function Debts() {
  const today = todayLocalISO()
  // undefined = loading, null = load failed
  const [debts, setDebts] = useState<CustomerDebt[] | null | undefined>(undefined)
  const [released, setReleased] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('oldest')
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

  const counts = useMemo(
    () => ({
      all: debts?.length ?? 0,
      over7: (debts ?? []).filter((d) => d.oldestDays > LONG_DAYS).length,
      released: (debts ?? []).filter((d) => released.has(d.key)).length,
    }),
    [debts, released],
  )

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = (debts ?? []).filter(
      (d) =>
        (!s || d.name.toLowerCase().includes(s) || (d.phone ?? '').includes(s)) &&
        (filter === 'all' ||
          (filter === 'over7' && d.oldestDays > LONG_DAYS) ||
          (filter === 'released' && released.has(d.key))),
    )
    // the API already returns oldest first
    return sort === 'largest' ? [...list].sort((a, b) => b.total - a.total) : list
  }, [debts, released, q, filter, sort])

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
  const FILTERS: [Filter, string][] = [
    ['all', 'ทั้งหมด'],
    ['over7', `เกิน ${LONG_DAYS} วัน`],
    ['released', 'ปลดแล้ววันนี้'],
  ]

  return (
    <div className="flex flex-col gap-4">
      {header}

      <section aria-label="สรุปยอดค้าง">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div className="col-span-2 sm:col-span-1">
            <StatTile label="ยอดค้างรวม" value={formatTHB(total)} emphasis />
          </div>
          <StatTile label="ลูกค้าค้างจ่าย" value={`${counts.all} ราย`} />
          <StatTile label={`ค้างเกิน ${LONG_DAYS} วัน`} value={`${counts.over7} ราย`} />
        </dl>
      </section>

      <div className="flex flex-col gap-2">
        <input
          className="min-w-0"
          placeholder="ค้นหาชื่อหรือเบอร์"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map(([f, label]) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={
                'btn btn-secondary btn-sm rounded-full ' +
                (filter === f ? 'border-ink text-ink' : 'text-ink-soft')
              }
            >
              {label}
              <span className="num text-xs text-ink-faint">{counts[f]}</span>
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
            เรียง
            <select
              className="w-auto"
              value={sort === 'oldest' ? 'ค้างนานสุด' : 'ยอดมากสุด'}
              onChange={(e) => setSort(e.target.value === 'ยอดมากสุด' ? 'largest' : 'oldest')}
            >
              <option>ค้างนานสุด</option>
              <option>ยอดมากสุด</option>
            </select>
          </label>
        </div>
      </div>

      <Notice flash={msg} />

      {shown.length === 0 ? (
        <EmptyState icon={Money} title={debts.length ? 'ไม่มีลูกค้าตรงกับที่เลือก' : 'ไม่มีลูกค้าค้างชำระ'} />
      ) : (
        <div className="table-wrap">
          <div
            aria-hidden="true"
            className={`hidden border-b border-line px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-wider text-ink-soft ${COLS}`}
          >
            <span>ลูกค้า</span>
            <span className="text-right">บิล</span>
            <span className="text-right">ยอดค้าง</span>
            <span>ค้างนานสุด</span>
            <span>สถานะ</span>
            <span />
          </div>
          <ul className="divide-y divide-line">
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
        </div>
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
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [releasing, setReleasing] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true)
    try {
      await fn()
      setConfirmId(null)
      onDone(ok)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const locked = d.lockedToday && !releasedToday
  const Caret = open ? CaretDown : CaretRight
  return (
    <li className={open ? 'bg-paper' : undefined}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 py-3 text-left hover:bg-paper ${COLS}`}
      >
        {/* phone: name | amount, then badges | bills; desktop: one column each */}
        <span className="col-start-1 row-start-1 min-w-0">
          <span className="block truncate font-semibold">{d.name}</span>
          <span className="num block text-xs text-ink-soft">{d.phone ?? 'ไม่มีเบอร์'}</span>
        </span>
        <span className="col-start-2 row-start-2 self-center text-right text-xs text-ink-soft sm:col-start-auto sm:row-start-auto sm:text-sm sm:text-ink">
          <span className="num">{d.bills.length}</span> บิล
        </span>
        <span className="num col-start-2 row-start-1 text-right text-base font-semibold sm:col-start-auto sm:row-start-auto">
          {formatTHB(d.total)}
        </span>
        <span className="col-start-1 row-start-2 flex flex-wrap items-center gap-2 sm:contents">
          <span>
            <AgeBadge days={d.oldestDays} />
          </span>
          <span className="text-xs">
            {releasedToday ? (
              <span className="badge badge-warn">ปลดแล้ววันนี้</span>
            ) : locked ? (
              <span className="inline-flex items-center gap-1 text-ink-soft">
                <LockSimple size={13} weight="bold" aria-hidden="true" />
                ล็อกอยู่
              </span>
            ) : null}
          </span>
        </span>
        <Caret size={16} className="hidden text-ink-faint sm:block" aria-hidden="true" />
      </button>

      {open && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          <div className="rounded-xl border border-line bg-surface">
            {d.bills.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line px-3 py-2.5 text-sm last:border-b-0"
              >
                <Link to={`/order/${b.id}`} className="link num">
                  {b.makro_order_no}
                </Link>
                <span className="text-ink-soft">ส่ง {formatDateTH(b.ship_date)}</span>
                <span className="num font-medium">{formatTHB(Number(b.outstanding_amount))}</span>
                <AgeBadge days={daysOwed(b.ship_date, today)} />
                <span className="ml-auto flex items-center gap-2">
                  {confirmId === b.id ? (
                    <>
                      <span className="text-xs text-ink-soft">ยืนยันรับเงินบิลนี้?</span>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        aria-label="ยืนยัน รับเงินแล้ว"
                        disabled={busy}
                        onClick={() =>
                          void run(() => markBillPaid(b.id), `บันทึกรับเงินบิล ${b.makro_order_no} แล้ว`)
                        }
                      >
                        ยืนยัน
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>
                        ยกเลิก
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => setConfirmId(b.id)}
                    >
                      รับเงินแล้ว
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>

          {locked && (
            <div className="flex flex-wrap items-center gap-2">
              {!releasing ? (
                <>
                  <span className="text-sm text-ink-soft">ลูกค้ารายนี้ถูกล็อก — ห้ามแพ็ค/ส่งจนกว่าจะจ่าย</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm sm:ml-auto"
                    onClick={() => setReleasing(true)}
                  >
                    ปลดให้แพ็ครอบวันนี้
                  </button>
                </>
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
