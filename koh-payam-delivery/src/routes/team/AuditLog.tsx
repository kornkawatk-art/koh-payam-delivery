import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Anchor,
  ChatCircle,
  ClockCounterClockwise,
  Flag,
  Money,
  Package,
  Receipt,
  type Icon,
} from '@phosphor-icons/react'
import { listAuditLogs, type AuditCategory, type AuditLogRow } from '../../lib/api/auditLogs'
import { SkeletonRows } from '../../components/ui/Skeleton'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDateTH } from '../../lib/format'

const CATEGORIES: { key: AuditCategory; label: string; icon: Icon; tone: string }[] = [
  { key: 'order', label: 'ออเดอร์', icon: Receipt, tone: 'bg-brand-soft text-brand-ink' },
  { key: 'pack', label: 'แพ็ค/ท่าเรือ', icon: Anchor, tone: 'bg-ok-soft text-ok-ink' },
  { key: 'claim', label: 'เคลม', icon: Flag, tone: 'bg-danger-soft text-danger-ink' },
  { key: 'money', label: 'การเงิน', icon: Money, tone: 'bg-warn-soft text-warn-ink' },
  { key: 'foam', label: 'ลังโฟม', icon: Package, tone: 'bg-info-soft text-info-ink' },
  { key: 'line', label: 'LINE', icon: ChatCircle, tone: 'bg-ok-soft text-ok-ink' },
]
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<AuditCategory, (typeof CATEGORIES)[number]>

const timeTH = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' })
const DAY = 24 * 60 * 60 * 1000

function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso)
  if (d.toDateString() === now.toDateString()) return 'วันนี้'
  if (d.toDateString() === new Date(now.getTime() - DAY).toDateString()) return 'เมื่อวาน'
  return formatDateTH(iso)
}

/**
 * ประวัติการใช้งาน: the last 30 days of who did what, grouped by day, with
 * filters by type and by person, a search, and links to the order or claim.
 */
export default function AuditLog() {
  const [rows, setRows] = useState<AuditLogRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [cat, setCat] = useState<AuditCategory | 'all'>('all')
  const [actor, setActor] = useState('ทุกคน')
  const [q, setQ] = useState('')

  const load = useCallback(() => {
    return listAuditLogs()
      .then((r) => {
        setRows(r)
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const actors = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.actor))).sort((a, b) => a.localeCompare(b, 'th')),
    [rows],
  )

  const days = useMemo(() => {
    const s = q.trim().toLowerCase()
    const now = new Date()
    const groups: { label: string; rows: AuditLogRow[] }[] = []
    for (const r of rows ?? []) {
      if (cat !== 'all' && r.category !== cat) continue
      if (actor !== 'ทุกคน' && r.actor !== actor) continue
      if (s && !`${r.text} ${r.message} ${r.actor}`.toLowerCase().includes(s)) continue
      const label = dayLabel(r.createdAt, now)
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.rows.push(r)
      else groups.push({ label, rows: [r] })
    }
    return groups
  }, [rows, cat, actor, q])

  const header = <PageHeader title="ประวัติการใช้งาน" icon={ClockCounterClockwise} />
  if (failed)
    return (
      <div className="flex flex-col gap-4">
        {header}
        <p className="alert alert-danger">โหลดประวัติการใช้งานไม่สำเร็จ</p>
      </div>
    )
  if (!rows)
    return (
      <div className="flex flex-col gap-4">
        {header}
        <SkeletonRows />
      </div>
    )
  if (rows.length === 0)
    return (
      <div className="flex flex-col gap-4">
        {header}
        <EmptyState icon={ClockCounterClockwise} title="ยังไม่มีประวัติการใช้งาน" />
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      {header}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <input
            className="min-w-0 flex-1"
            placeholder="ค้นหาเลข PO / ชื่อลูกค้า / เบอร์"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select aria-label="คนทำ" className="w-auto" value={actor} onChange={(e) => setActor(e.target.value)}>
            <option>ทุกคน</option>
            {actors.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ key: 'all' as const, label: 'ทั้งหมด' }, ...CATEGORIES].map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={cat === c.key}
              onClick={() => setCat(c.key)}
              className={
                'btn btn-secondary btn-sm shrink-0 rounded-full ' + (cat === c.key ? 'border-ink text-ink' : 'text-ink-soft')
              }
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {days.length === 0 ? (
        <EmptyState icon={ClockCounterClockwise} title="ไม่พบรายการที่ตรงกับที่เลือก" />
      ) : (
        days.map((d) => (
          <section key={d.label} aria-label={`${d.label} · ${d.rows.length} รายการ`} className="flex flex-col gap-2">
            <h2 className="flex items-baseline justify-between px-1 text-sm font-semibold text-ink-soft">
              {d.label}
              <span className="num text-xs font-normal text-ink-faint">{d.rows.length} รายการ</span>
            </h2>
            <ul className="table-wrap divide-y divide-line">
              {d.rows.map((r) => (
                <li key={r.id}>
                  <Entry r={r} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <p className="text-center text-xs text-ink-faint">เก็บประวัติย้อนหลัง 30 วัน</p>
    </div>
  )
}

function Entry({ r }: { r: AuditLogRow }) {
  const c = CAT[r.category] ?? CAT.order
  const CatIcon = c.icon
  const body = (
    <>
      <time dateTime={r.createdAt} className="num text-xs text-ink-soft">
        {timeTH.format(new Date(r.createdAt))}
      </time>
      <span className={`flex h-7 w-7 items-center justify-center rounded-md ${c.tone}`} aria-hidden="true">
        <CatIcon size={15} />
      </span>
      <span className="min-w-0 text-sm">{r.text}</span>
      <span className="col-start-3 justify-self-start whitespace-nowrap rounded-full border border-line-strong px-2 text-xs text-ink-soft sm:col-start-auto">
        {r.actor}
      </span>
    </>
  )
  const cls =
    'grid grid-cols-[3rem_1.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[3rem_1.75rem_minmax(0,1fr)_auto]'
  return r.link ? (
    <Link to={r.link} className={cls + ' hover:bg-paper'}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
