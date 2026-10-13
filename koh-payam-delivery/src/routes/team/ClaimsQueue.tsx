import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listClaims, type ClaimRow } from '../../lib/api/claims'
import {
  backorderQty,
  listUnmatchedBackorders,
  type UnmatchedBackorderRow,
} from '../../lib/api/backorders'
import {
  CaretRight,
  CheckCircle,
  Egg,
  Flag,
  Package,
  Warning,
  type Icon,
} from '@phosphor-icons/react'
import { SkeletonRows } from '../../components/ui/Skeleton'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/EmptyState'
import { StatTile } from '../../components/ui/Stat'
import { formatDateTimeTH } from '../../lib/format'
import { claimTypeTH } from '../../lib/claimTypes'
import { claimStatusTH, respondBy, timeLeft } from '../../lib/claimSla'

type Tab = 'open' | 'approved' | 'rejected' | 'backorders' | 'all'

const TYPE_ICON: Record<string, Icon> = {
  missing_in_box: Package,
  damaged: Warning,
  broken_eggs: Egg,
  box_lost: Package,
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const inTab = (c: ClaimRow, tab: Tab) =>
  tab === 'all' ||
  (tab === 'open' && c.status === 'open') ||
  (tab === 'approved' && (c.status === 'approved' || c.status === 'closed')) ||
  (tab === 'rejected' && c.status === 'rejected')

/**
 * คิวเคลม: opens on the claims waiting for a decision, the most urgent first
 * (a manager has 24h from the customer's report -- lib/claimSla.ts). Other
 * tabs show decided claims and the resends still waiting to be matched.
 */
export default function ClaimsQueue() {
  const [tab, setTab] = useState<Tab>('open')
  const [claims, setClaims] = useState<ClaimRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  // Backorders load independently: a failure on either side never blanks the other.
  const [backorders, setBackorders] = useState<UnmatchedBackorderRow[] | null>(null)
  const [backordersFailed, setBackordersFailed] = useState(false)

  useEffect(() => {
    let active = true
    listClaims()
      .then((r) => active && setClaims(r))
      .catch(() => active && setFailed(true))
    listUnmatchedBackorders()
      .then((r) => active && setBackorders(r))
      .catch(() => active && setBackordersFailed(true))
    return () => {
      active = false
    }
  }, [])

  const now = Date.now()
  const open = useMemo(
    () => (claims ?? []).filter((c) => c.status === 'open').sort((a, b) => respondBy(a.created_at) - respondBy(b.created_at)),
    [claims],
  )
  const late = open.filter((c) => timeLeft(c.created_at, now).late).length
  const shown = useMemo(
    () =>
      tab === 'open'
        ? open
        : (claims ?? []).filter((c) => inTab(c, tab)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [claims, open, tab],
  )

  const count = (t: Tab) =>
    t === 'backorders' ? backorders?.length : claims ? claims.filter((c) => inTab(c, t)).length : undefined
  const TABS: [Tab, string][] = [
    ['open', 'รอตัดสิน'],
    ['approved', 'อนุมัติแล้ว'],
    ['rejected', 'ปฏิเสธ'],
    ['backorders', 'ค้างส่งชดเชย'],
    ['all', 'ทั้งหมด'],
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="คิวเคลม" icon={Flag} />

      <section aria-label="สรุปคิวเคลม">
        <dl className="grid grid-cols-3 gap-3">
          <StatTile label="รอตัดสิน" value={claims ? open.length : '–'} emphasis={open.length > 0} />
          <StatTile label="เกินเวลาตอบ" value={claims ? late : '–'} danger={late > 0} />
          <StatTile label="ค้างส่งชดเชย" value={backorders ? backorders.length : '–'} />
        </dl>
      </section>

      <div role="tablist" aria-label="สถานะเคลม" className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([t, label]) => {
          const n = count(t)
          const on = tab === t
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t)}
              className={
                'flex min-h-[2.75rem] shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm ' +
                (on ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-soft hover:text-ink')
              }
            >
              {label}
              {n !== undefined && t !== 'all' && (
                <span
                  className={
                    'num rounded-full px-1.5 text-xs ' +
                    (t === 'open' && n > 0 ? 'bg-danger text-on' : 'bg-line text-ink-soft')
                  }
                >
                  {n}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div role="tabpanel">
        {tab === 'backorders' ? (
          <BackordersPanel rows={backorders} failed={backordersFailed} now={now} />
        ) : failed ? (
          <p className="alert alert-danger">โหลดคิวเคลมไม่สำเร็จ</p>
        ) : !claims ? (
          <SkeletonRows rows={3} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title={tab === 'open' ? 'ไม่มีเคลมรอตัดสิน' : 'ไม่มีเคลมในแท็บนี้'}
          />
        ) : (
          <ul className="table-wrap divide-y divide-line">
            {shown.map((c) => (
              <ClaimItem key={c.id} c={c} now={now} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ClaimItem({ c, now }: { c: ClaimRow; now: number }) {
  const TypeIcon = TYPE_ICON[c.type] ?? Flag
  const status = claimStatusTH(c.status, c.resolution)
  const left = c.status === 'open' ? timeLeft(c.created_at, now) : null
  return (
    <li>
      <Link
        to={`/claims/${c.id}`}
        className={
          'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-paper ' +
          'sm:grid-cols-[minmax(0,1fr)_10rem_10rem_8.5rem_1rem] sm:items-center sm:gap-x-4 ' +
          (left?.late ? 'border-l-4 border-l-danger' : 'border-l-4 border-l-transparent')
        }
      >
        <span className="col-start-1 row-start-1 min-w-0">
          <span className="block truncate font-semibold">{c.customer_name_en}</span>
          <span className="block text-xs text-ink-soft">
            <span className="num">{c.makro_order_no}</span> · <span className="num">{c.itemCount}</span> รายการ
          </span>
        </span>
        <span className="col-start-1 row-start-2 flex flex-wrap items-center gap-2 sm:contents">
          <span>
            <span className="badge badge-neutral">
              <TypeIcon size={13} aria-hidden="true" />
              {claimTypeTH(c.type)}
            </span>
          </span>
          <span>
            <span className={`badge ${status.tone}`}>{status.label}</span>
          </span>
        </span>
        <span
          className={
            'col-start-2 row-start-1 text-right text-xs sm:col-start-auto sm:row-start-auto sm:text-left sm:text-sm ' +
            (left?.late ? 'font-semibold text-danger-ink' : 'text-ink-soft')
          }
        >
          {left ? left.label : `แจ้ง ${formatDateTimeTH(c.created_at)}`}
          {left && (
            <span className="block text-[11px] font-normal text-ink-faint">
              แจ้ง {formatDateTimeTH(c.created_at)}
            </span>
          )}
        </span>
        <CaretRight size={16} className="hidden text-ink-faint sm:block" aria-hidden="true" />
      </Link>
    </li>
  )
}

function BackordersPanel({
  rows,
  failed,
  now,
}: {
  rows: UnmatchedBackorderRow[] | null
  failed: boolean
  now: number
}) {
  if (failed) return <p className="alert alert-danger">โหลดรายการค้างส่งที่ยังจับคู่ไม่สำเร็จ</p>
  if (!rows) return <SkeletonRows rows={3} />
  if (rows.length === 0)
    return <EmptyState icon={CheckCircle} title="ไม่มีรายการค้างส่งที่ยังจับคู่ไม่สำเร็จ" />
  return (
    <div className="flex flex-col gap-2">
      <p className="muted">ของที่อนุมัติให้ส่งชดเชย แต่ยังหาออเดอร์รอบถัดไปของลูกค้าไม่เจอ — ค้างเกิน 7 วันเป็นแถบแดง</p>
      <div className="table-wrap">
        <table className="data-table stack-table">
          <thead>
            <tr>
              <th>ลูกค้า</th>
              <th>สินค้า</th>
              <th>ค้างมาแล้ว</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const days = Math.floor((now - new Date(b.createdAt).getTime()) / MS_PER_DAY)
              return (
                <tr key={b.id} className={days > 7 ? 'bg-danger-soft' : undefined}>
                  <td className="stack-lead">{b.customerName}</td>
                  <td data-label="สินค้า">
                    {b.productName} {backorderQty(b)}
                  </td>
                  <td data-label="ค้างมาแล้ว" className="num">
                    {days} วัน
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
