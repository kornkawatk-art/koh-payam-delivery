import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Equals, Minus, Package, Plus } from '@phosphor-icons/react'
import { PageHeader } from '../../components/ui/PageHeader'
import { PageSkeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { Notice, flash, type Flash } from '../../components/ui/Notice'
import { StatTile } from '../../components/ui/Stat'
import { useAuth } from '../../lib/auth'
import { formatDateTH, formatDateTimeTH } from '../../lib/format'
import {
  LONG_HELD_DAYS,
  foamTimeline,
  heldDays,
  heldTone,
  lastReturnAt,
  returnedSince,
} from '../../lib/foamTrack'
import {
  listFoamCustomers,
  recordFoamReturn,
  setFoamBalance,
  type FoamCustomer,
} from '../../lib/api/foamBoxes'

const KIND_TH = { sent: 'ส่งไป', return: 'รับคืน', set: 'ตั้งยอด' } as const
const KIND_ICON = { sent: ArrowUp, return: ArrowDown, set: Equals } as const
const KIND_TONE = { sent: 'bg-warn-soft text-warn-ink', return: 'bg-ok-soft text-ok-ink', set: 'bg-line text-ink-soft' } as const
const WEEK = 7 * 24 * 60 * 60 * 1000

type Filter = 'held' | 'long' | 'all'
type Sort = 'longest' | 'most'
type Row = FoamCustomer & { days: number | null; lastReturn: string | null }

const isLong = (r: Row) => r.balance > 0 && (r.days ?? 0) > LONG_HELD_DAYS

// Shared column layout for the header and each row (desktop only; phones stack).
const COLS = 'sm:grid sm:grid-cols-[minmax(0,1fr)_5rem_8rem_9.5rem_auto] sm:items-center sm:gap-x-4'

/**
 * ลังโฟม: who holds the shop's foam boxes and for how long, so the oldest are
 * chased first. Pier staff and managers record returns; managers set a balance
 * (opening count or correction). Each row opens a timeline with the balance
 * after every step.
 */
export default function FoamBoxes() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'
  // undefined = loading, null = tracking not enabled yet (migration 0031 not run)
  const [customers, setCustomers] = useState<FoamCustomer[] | null | undefined>(undefined)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('held')
  const [sort, setSort] = useState<Sort>('longest')
  const [msg, setMsg] = useState<Flash>()

  const load = useCallback(() => {
    listFoamCustomers()
      .then(setCustomers)
      .catch(() => setCustomers(null))
  }, [])
  useEffect(load, [load])

  const rows: Row[] = useMemo(() => {
    const now = Date.now()
    return (customers ?? []).map((c) => ({
      ...c,
      days: c.balance > 0 ? heldDays(c.events, now) : null,
      lastReturn: lastReturnAt(c.events),
    }))
  }, [customers])

  const counts = {
    held: rows.filter((r) => r.balance > 0).length,
    long: rows.filter(isLong).length,
    all: rows.length,
  }

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = rows.filter(
      (r) =>
        (filter === 'all' || (filter === 'held' ? r.balance > 0 : isLong(r))) &&
        (!s || r.name.toLowerCase().includes(s) || (r.phone ?? '').includes(s)),
    )
    return [...list].sort((a, b) =>
      sort === 'most'
        ? b.balance - a.balance || (b.days ?? -1) - (a.days ?? -1)
        : (b.days ?? -1) - (a.days ?? -1) || b.balance - a.balance || a.name.localeCompare(b.name),
    )
  }, [rows, q, filter, sort])

  const header = <PageHeader title="ลังโฟม" icon={Package} />
  if (customers === undefined) return <PageSkeleton rows={6} />
  if (customers === null)
    return (
      <div className="flex flex-col gap-4">
        {header}
        <p className="alert alert-warn">ยังไม่ได้เปิดใช้ระบบติดตามลังโฟม (รอรัน migration 0031)</p>
      </div>
    )

  const total = rows.reduce((n, r) => n + r.balance, 0)
  const returnedWeek = returnedSince(rows.map((r) => r.events), Date.now() - WEEK)
  const FILTERS: [Filter, string][] = [
    ['held', 'ถือลังอยู่'],
    ['long', `ค้างเกิน ${LONG_HELD_DAYS} วัน`],
    ['all', 'ทั้งหมด'],
  ]

  return (
    <div className="flex flex-col gap-4">
      {header}

      <section aria-label="สรุปลังโฟม">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="ลังที่อยู่กับลูกค้า" value={`${total} ใบ`} emphasis />
          <StatTile label="ลูกค้าที่ถือลัง" value={`${counts.held} ราย`} />
          <StatTile label={`ค้างเกิน ${LONG_HELD_DAYS} วัน`} value={`${counts.long} ราย`} danger={counts.long > 0} />
          <StatTile label="รับคืน 7 วันล่าสุด" value={`${returnedWeek} ใบ`} />
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
                'btn btn-secondary btn-sm rounded-full ' + (filter === f ? 'border-ink text-ink' : 'text-ink-soft')
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
              value={sort === 'longest' ? 'ถือนานสุด' : 'ถือมากสุด'}
              onChange={(e) => setSort(e.target.value === 'ถือมากสุด' ? 'most' : 'longest')}
            >
              <option>ถือนานสุด</option>
              <option>ถือมากสุด</option>
            </select>
          </label>
        </div>
      </div>

      <Notice flash={msg} />

      {shown.length === 0 ? (
        <EmptyState
          icon={Package}
          title={filter === 'held' ? 'ไม่มีลูกค้าที่ถือลังโฟมอยู่' : 'ไม่มีลูกค้าตรงกับที่เลือก'}
          hint="เลือก “ทั้งหมด” เพื่อตั้งยอดให้ลูกค้ารายอื่น"
        />
      ) : (
        <div className="table-wrap">
          <div
            aria-hidden="true"
            className={`hidden border-b border-line px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-wider text-ink-soft ${COLS}`}
          >
            <span>ลูกค้า</span>
            <span className="text-right">ถืออยู่</span>
            <span>ถือมานาน</span>
            <span>ส่ง / คืนล่าสุด</span>
            <span />
          </div>
          <ul className="divide-y divide-line">
            {shown.map((r) => (
              <FoamRow
                key={r.key}
                r={r}
                isManager={isManager}
                onSaved={(text) => {
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

function FoamRow({
  r,
  isManager,
  onSaved,
  onError,
}: {
  r: Row
  isManager: boolean
  onSaved: (text: string) => void
  onError: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<'return' | 'set' | null>(null)
  const [qty, setQty] = useState('1')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const n = Math.floor(Number(qty))
  const valid = qty !== '' && Number.isInteger(n) && n >= (action === 'return' ? 1 : 0) && n <= 9999
  const ref = { key: r.key, name: r.name }

  function start(a: 'return' | 'set') {
    const same = open && action === a
    setOpen(!same)
    setAction(same ? null : a)
    setQty(a === 'set' ? String(r.balance) : '1')
    setNote('')
  }

  async function save() {
    setBusy(true)
    try {
      if (action === 'return') {
        await recordFoamReturn(ref, n, note)
        onSaved(`บันทึกรับคืน ${n} ใบ จาก ${r.name} แล้ว`)
      } else {
        await setFoamBalance(ref, n, note)
        onSaved(`ตั้งยอดลังโฟมของ ${r.name} เป็น ${n} ใบแล้ว`)
      }
      setAction(null)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const timeline = [...foamTimeline(r.events)].reverse()
  return (
    <li className={open ? 'bg-paper' : undefined}>
      <div className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3 ${COLS}`}>
        <button
          type="button"
          aria-expanded={open}
          className="col-start-1 row-start-1 min-w-0 text-left"
          onClick={() => {
            setOpen((o) => !o)
            setAction(null)
          }}
        >
          <span className="block truncate font-semibold">{r.name}</span>
          <span className="num block text-xs text-ink-soft">{r.phone ?? 'ไม่มีเบอร์'}</span>
        </button>
        <span className="col-start-2 row-start-1 text-right sm:col-start-auto sm:row-start-auto">
          <span className="num text-lg font-semibold">{r.balance}</span>{' '}
          <span className="text-xs text-ink-soft">ใบ</span>
        </span>
        <span className="col-start-1 row-start-2 flex flex-wrap items-center gap-2 sm:contents">
          <span>
            {r.days !== null ? (
              <span className={`badge ${heldTone(r.days)}`}>ถือมา {r.days} วัน</span>
            ) : (
              <span className="text-xs text-ink-faint">—</span>
            )}
          </span>
          <span className="text-xs leading-5 text-ink-soft">
            <span className="mr-2 sm:mr-0 sm:block">
              ส่งล่าสุด <span className="text-ink">{r.lastSentAt ? formatDateTH(r.lastSentAt) : '—'}</span>
            </span>
            <span className="sm:block">
              คืนล่าสุด <span className="text-ink">{r.lastReturn ? formatDateTH(r.lastReturn) : '—'}</span>
            </span>
          </span>
        </span>
        <span className="col-start-2 row-start-2 flex items-center justify-end gap-1.5 sm:col-start-auto sm:row-start-auto">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => start('return')}>
            รับคืน
          </button>
          {isManager && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => start('set')}>
              ตั้งยอด
            </button>
          )}
        </span>
      </div>

      {open && (
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
          {action && (
            <div className="card flex flex-col gap-3 text-sm">
              <p className="section-title">{action === 'return' ? 'รับคืนลังเปล่า' : 'ตั้งยอดลังที่ลูกค้าถืออยู่'}</p>
              <div className="flex items-center gap-2">
                {action === 'return' && (
                  <button
                    type="button"
                    className="btn btn-secondary h-11 w-11 p-0"
                    aria-label="ลดจำนวน"
                    disabled={n <= 1}
                    onClick={() => setQty(String(Math.max(1, (Number.isFinite(n) ? n : 1) - 1)))}
                  >
                    <Minus size={18} weight="bold" aria-hidden="true" />
                  </button>
                )}
                <input
                  type="number"
                  inputMode="numeric"
                  min={action === 'return' ? 1 : 0}
                  className="num w-20 text-center text-lg"
                  aria-label={action === 'return' ? 'จำนวนที่รับคืน' : 'ยอดค้างตอนนี้'}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
                {action === 'return' && (
                  <button
                    type="button"
                    className="btn btn-secondary h-11 w-11 p-0"
                    aria-label="เพิ่มจำนวน"
                    onClick={() => setQty(String((Number.isFinite(n) ? n : 0) + 1))}
                  >
                    <Plus size={18} weight="bold" aria-hidden="true" />
                  </button>
                )}
                <span className="text-ink-soft">ใบ</span>
              </div>
              {action === 'return' && r.balance > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm self-start border border-dashed border-line-strong"
                  onClick={() => setQty(String(r.balance))}
                >
                  คืนครบ {r.balance} ใบ
                </button>
              )}
              <input placeholder="หมายเหตุ (ไม่บังคับ)" value={note} onChange={(e) => setNote(e.target.value)} />
              {action === 'return' && valid && n > r.balance && (
                <p className="text-xs text-warn-ink">
                  มากกว่ายอดค้าง ({r.balance} ใบ) — บันทึกได้ แต่ยอดจะเป็น 0 และส่วนเกินไม่นับเป็นเครดิต
                </p>
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={!valid || busy}
                onClick={() => void save()}
              >
                {action === 'return' ? (valid ? `บันทึกรับคืน ${n} ใบ` : 'บันทึกรับคืน') : 'บันทึกยอด'}
              </button>
            </div>
          )}

          <div className={'card flex flex-col gap-2 ' + (action ? '' : 'sm:col-span-2')}>
            <p className="section-title">ประวัติ</p>
            {timeline.length === 0 ? (
              <p className="muted">ยังไม่มีประวัติ</p>
            ) : (
              <ul aria-label="ประวัติ" className="flex flex-col divide-y divide-line text-sm">
                {timeline.map((e, i) => {
                  const Icon = KIND_ICON[e.kind]
                  return (
                    <li key={i} className="flex items-center gap-3 py-2">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${KIND_TONE[e.kind]}`}
                        aria-hidden="true"
                      >
                        <Icon size={12} weight="bold" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">
                          {KIND_TH[e.kind]} {e.qty} ใบ
                        </span>
                        {e.label && <span className="num text-ink-soft"> · {e.label}</span>}
                        {e.by && <span className="text-ink-soft"> · โดย {e.by}</span>}
                        <span className="block text-xs text-ink-faint">{formatDateTimeTH(e.at)}</span>
                      </span>
                      <span className="num shrink-0 text-xs text-ink-soft">คงเหลือ {e.after}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
