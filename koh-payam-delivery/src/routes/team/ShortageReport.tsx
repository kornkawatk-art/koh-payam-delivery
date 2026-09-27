import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CaretDown,
  ChartBar,
  CheckCircle,
  Copy,
  DownloadSimple,
  Info,
} from '@phosphor-icons/react'
import {
  getShortageReport,
  type ShortageDeptGroup,
  type ShortageProductRow,
  type ShortageReport as Report,
} from '../../lib/api/shortageReport'
import type { DeptGroupCode } from '../../lib/departments'
import { buildLineSummary, downloadShortageExcel, formatQty } from '../../lib/shortageExport'
import { SkeletonRows } from '../../components/ui/Skeleton'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/EmptyState'
import { StatTile } from '../../components/ui/Stat'
import { Notice, flash, type Flash } from '../../components/ui/Notice'
import { formatDateTH } from '../../lib/format'

// Calendar-local ISO date (not UTC) -- same convention as format.ts's
// todayLocalISO.
function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localISO(d)
}

type Preset = { id: string; label: string; range: () => [string, string] }

const PRESETS: Preset[] = [
  { id: '7d', label: '7 วัน', range: () => [daysAgo(6), daysAgo(0)] },
  { id: '30d', label: '30 วัน', range: () => [daysAgo(29), daysAgo(0)] },
  {
    id: 'month',
    label: 'เดือนนี้',
    range: () => {
      const d = new Date()
      return [localISO(new Date(d.getFullYear(), d.getMonth(), 1)), localISO(d)]
    },
  },
  {
    id: 'prev',
    label: 'เดือนก่อน',
    range: () => {
      const d = new Date()
      return [
        localISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
        localISO(new Date(d.getFullYear(), d.getMonth(), 0)),
      ]
    },
  },
]

export default function ShortageReport() {
  const [[fromDate, toDate], setRange] = useState<[string, string]>(() => PRESETS[1].range())
  const [report, setReport] = useState<Report | null>(null)
  const [failed, setFailed] = useState(false)
  const [deptFilter, setDeptFilter] = useState<DeptGroupCode | 'ALL'>('ALL')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [exportMsg, setExportMsg] = useState<Flash>()

  const load = useCallback(() => {
    setFailed(false)
    setReport(null)
    setOpenKey(null)
    return getShortageReport(fromDate, toDate)
      .then((r) => setReport(r))
      .catch(() => setFailed(true))
  }, [fromDate, toDate])

  useEffect(() => {
    void load()
  }, [load])

  const activePreset = PRESETS.find((p) => {
    const [f, t] = p.range()
    return f === fromDate && t === toDate
  })?.id

  const visibleGroups = useMemo(
    () =>
      (report?.groups ?? []).filter((g) => deptFilter === 'ALL' || g.code === deptFilter),
    [report, deptFilter],
  )
  // Bars compare across the whole report, so a long bar means "often short"
  // no matter which department it sits in.
  const maxCount = useMemo(
    () =>
      Math.max(1, ...(report?.groups ?? []).flatMap((g) => g.products.map((p) => p.orderCount))),
    [report],
  )

  async function exportExcel() {
    if (!report) return
    setExportMsg(undefined)
    try {
      await downloadShortageExcel(report, fromDate, toDate)
    } catch (e) {
      setExportMsg(flash.error('ดาวน์โหลด Excel ไม่สำเร็จ: ' + (e as Error).message))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="รายงานของขาด"
        icon={ChartBar}
        accent="violet"
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void exportExcel()}
            disabled={!report || report.groups.length === 0}
          >
            <DownloadSimple size={18} aria-hidden="true" />
            ดาวน์โหลด Excel
          </button>
        }
      />

      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-3">
        <div role="group" aria-label="ช่วงเวลา" className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={activePreset === p.id}
              onClick={() => setRange(p.range())}
              className={
                'btn btn-sm ' + (activePreset === p.id ? 'btn-primary' : 'btn-ghost text-ink-soft')
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <label className="flex items-center gap-1.5">
            จาก
            <input
              type="date"
              className="w-auto"
              value={fromDate}
              onChange={(e) => setRange([e.target.value, toDate])}
            />
          </label>
          <label className="flex items-center gap-1.5">
            ถึง
            <input
              type="date"
              className="w-auto"
              value={toDate}
              onChange={(e) => setRange([fromDate, e.target.value])}
            />
          </label>
        </div>
      </div>

      <Notice flash={exportMsg} />

      {failed ? (
        <p className="alert alert-danger">โหลดรายงานของขาดไม่สำเร็จ</p>
      ) : !report ? (
        <SkeletonRows rows={5} />
      ) : report.groups.length === 0 ? (
        <EmptyState
          icon={CheckCircle}
          title="ไม่มีของขาดในช่วงที่เลือก"
          hint="ลูกค้าได้รับของครบทุกรายการในช่วงนี้"
        />
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatTile label="สินค้าที่ขาด" value={report.productCount} />
            <StatTile label="ขาดทั้งหมด (ครั้ง)" value={report.occurrenceCount} emphasis />
            <StatTile label="ออเดอร์ที่ได้รับผลกระทบ" value={report.affectedOrderCount} />
          </dl>

          <div
            role="group"
            aria-label="กรองตามแผนก"
            className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
          >
            <FilterChip
              active={deptFilter === 'ALL'}
              onClick={() => setDeptFilter('ALL')}
              label="ทั้งหมด"
              count={report.productCount}
            />
            {report.groups.map((g) => (
              <FilterChip
                key={g.code}
                active={deptFilter === g.code}
                onClick={() => setDeptFilter(g.code)}
                label={g.label}
                count={g.products.length}
              />
            ))}
          </div>

          <div className="flex flex-col gap-4">
            {visibleGroups.map((g) => (
              <DeptSection
                key={g.code}
                group={g}
                from={fromDate}
                to={toDate}
                maxCount={maxCount}
                openKey={openKey}
                onToggle={(k) => setOpenKey((cur) => (cur === k ? null : k))}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        'btn btn-sm shrink-0 gap-1.5 rounded-full ' +
        (active ? 'btn-primary' : 'btn-secondary text-ink-soft')
      }
    >
      {label}
      <span
        className={
          'tnum rounded-full px-1.5 text-xs ' + (active ? 'bg-white/20' : 'bg-paper text-ink-soft')
        }
      >
        {count}
      </span>
    </button>
  )
}

function DeptSection({
  group: g,
  from,
  to,
  maxCount,
  openKey,
  onToggle,
}: {
  group: ShortageDeptGroup
  from: string
  to: string
  maxCount: number
  openKey: string | null
  onToggle: (key: string) => void
}) {
  const [copied, setCopied] = useState<Flash>()

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(buildLineSummary(g, from, to))
      setCopied(flash.ok('คัดลอกแล้ว — วางในไลน์ได้เลย'))
      window.setTimeout(() => setCopied(undefined), 3000)
    } catch {
      setCopied(flash.error('คัดลอกไม่สำเร็จ — เบราว์เซอร์ไม่อนุญาตให้คัดลอก'))
    }
  }

  return (
    <section className="card overflow-hidden p-0 sm:p-0" aria-label={`แผนก ${g.label}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-ink px-2.5 py-1 text-sm font-semibold tracking-wide text-white">
            {g.label}
          </span>
          <p className="text-sm text-ink-soft">
            <span className="tnum font-semibold text-ink">{g.products.length}</span> รายการ · ขาด{' '}
            <span className="tnum font-semibold text-ink">{g.occurrenceCount}</span> ครั้ง
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copySummary()}>
          <Copy size={16} aria-hidden="true" />
          คัดลอกสรุป
        </button>
      </header>

      {g.code === 'UNKNOWN' && (
        <p className="flex items-start gap-2 border-b border-line px-4 py-2.5 text-xs text-ink-soft">
          <Info size={16} className="mt-px shrink-0" aria-hidden="true" />
          ออเดอร์ที่นำเข้าก่อนระบบเริ่มเก็บแผนก — นำเข้าไฟล์ของวันนั้นซ้ำ (เลือกวันจัดส่งเดิม)
          เพื่อเติมแผนกให้
        </p>
      )}

      {copied && (
        <div className="border-b border-line px-4 py-2">
          <Notice flash={copied} />
        </div>
      )}

      <ol>
        {g.products.map((p, i) => (
          <ProductRow
            key={p.key}
            rank={i + 1}
            product={p}
            maxCount={maxCount}
            open={openKey === `${g.code}:${p.key}`}
            onToggle={() => onToggle(`${g.code}:${p.key}`)}
          />
        ))}
      </ol>
    </section>
  )
}

function ProductRow({
  rank,
  product: p,
  maxCount,
  open,
  onToggle,
}: {
  rank: number
  product: ShortageProductRow
  maxCount: number
  open: boolean
  onToggle: () => void
}) {
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-paper/70"
      >
        <span className="tnum w-5 shrink-0 text-right text-xs font-medium text-ink-faint">
          {rank}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium text-ink">{p.productName}</span>
          {p.itemId && <span className="tnum text-xs text-ink-soft">{p.itemId}</span>}
          <span className="block h-1.5 max-w-xs overflow-hidden rounded-full bg-line" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-warn"
              style={{ width: `${(p.orderCount / maxCount) * 100}%` }}
            />
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="text-sm text-ink-soft">
            ขาด <span className="tnum text-xl font-semibold text-ink">{p.orderCount}</span> ครั้ง
          </span>
          <span className="tnum text-xs text-ink-soft">รวม {formatQty(p.totalQty)}</span>
        </span>
        <CaretDown
          size={16}
          className={'shrink-0 text-ink-faint transition-transform ' + (open ? 'rotate-180' : '')}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="table-wrap rounded-none border-x-0 border-b-0 shadow-none">
          <table className="data-table stack-table">
            <thead>
              <tr>
                <th>เลขออเดอร์</th>
                <th>ลูกค้า</th>
                <th>วันที่ส่ง</th>
                <th>จำนวน</th>
              </tr>
            </thead>
            <tbody>
              {p.details.map((d) => (
                <tr key={d.orderId}>
                  <td className="stack-lead whitespace-nowrap">
                    <Link className="link" to={`/order/${d.orderId}`}>
                      {d.makroOrderNo}
                    </Link>
                  </td>
                  <td data-label="ลูกค้า">{d.customerNameEn}</td>
                  <td data-label="วันที่ส่ง" className="whitespace-nowrap">
                    {formatDateTH(d.shipDate)}
                  </td>
                  <td data-label="จำนวน" className="tnum">
                    {formatQty(d.qty)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  )
}
