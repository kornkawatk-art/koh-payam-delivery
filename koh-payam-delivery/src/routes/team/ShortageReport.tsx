import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CaretDown,
  ChartBar,
  CheckCircle,
  Copy,
  DownloadSimple,
  Info,
  UploadSimple,
} from '@phosphor-icons/react'
import { getShortageReport, type ShortageReport as Report } from '../../lib/api/shortageReport'
import { getItemPrices, saveItemPrices } from '../../lib/api/itemPrices'
import {
  formatBaht,
  parsePriceSheet,
  withValues,
  type PricedGroup,
  type PricedProduct,
} from '../../lib/itemPrices'
import { useAuth } from '../../lib/auth'
import { isLead } from '../../lib/roles'
import { DEPT_COLORS, type DeptGroupCode } from '../../lib/departments'
import { buildLineSummary, downloadShortageExcel, formatQty } from '../../lib/shortageExport'
import { SkeletonRows } from '../../components/ui/Skeleton'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/EmptyState'
import { StatTile } from '../../components/ui/Stat'
import { Notice, flash, type Flash } from '../../components/ui/Notice'
import { formatDateTH } from '../../lib/format'
import { deptBars, rankProducts, shortageTrend } from '../../lib/shortageCharts'
import { TrendColumnChart } from '../../components/charts/ShortageCharts'

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

// A cleared date field is ignored (keeps the last valid date); a "from" after
// the "to" is swapped rather than silently returning an empty report.
const ordered = (a: string, b: string): [string, string] => (a <= b ? [a, b] : [b, a])

/** The ranked list shows this many first. */
const TOP_N = 20

const PRESETS: Preset[] = [
  { id: 'today', label: 'วันนี้', range: () => [daysAgo(0), daysAgo(0)] },
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

/** The file's bytes (FileReader: works where Blob.arrayBuffer doesn't) */
const readFile = (f: File) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as ArrayBuffer)
    r.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'))
    r.readAsArrayBuffer(f)
  })

/** Every item code in the report (the ones a price can be looked up for) */
const itemIds = (r: Report) => r.groups.flatMap((g) => g.products.map((p) => p.itemId)).filter(Boolean)

export default function ShortageReport() {
  const lead = isLead(useAuth().profile?.role)
  const [[fromDate, toDate], setRange] = useState<[string, string]>(() =>
    PRESETS.find((p) => p.id === '30d')!.range(),
  )
  const [rawReport, setReport] = useState<Report | null>(null)
  // null = prices not loaded (table missing or the request failed): the page simply shows no money
  const [prices, setPrices] = useState<Map<string, number> | null>(null)
  const [sortBy, setSortBy] = useState<'count' | 'value'>('count')
  const [priceMsg, setPriceMsg] = useState<Flash>()
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [failed, setFailed] = useState(false)
  const [deptFilter, setDeptFilter] = useState<DeptGroupCode | 'ALL'>('ALL')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [exportMsg, setExportMsg] = useState<Flash>()
  // 'rank' = one list across departments (default); 'dept' = a section per department
  const [view, setView] = useState<'rank' | 'dept'>('rank')
  const [showAll, setShowAll] = useState(false)

  const [loading, setLoading] = useState(true)
  const latest = useRef(0)

  // A range change keeps the previous report on screen (faded) until the new
  // one lands -- no skeleton flash or layout jump. Only the first load shows
  // a skeleton. Responses that arrive out of order are ignored.
  // The range actually queried: a "from" after the "to" is swapped, and a
  // half-edited (blank) date doesn't query at all.
  const [rangeFrom, rangeTo] = ordered(fromDate, toDate)

  const load = useCallback(() => {
    if (!rangeFrom || !rangeTo) return Promise.resolve()
    const req = ++latest.current
    setFailed(false)
    setLoading(true)
    setOpenKey(null)
    setShowAll(false)
    return getShortageReport(rangeFrom, rangeTo)
      .then(async (r) => {
        const p = await getItemPrices(itemIds(r)).catch(() => null)
        if (req === latest.current) {
          setReport(r)
          setPrices(p)
        }
      })
      .catch(() => {
        if (req === latest.current) setFailed(true)
      })
      .finally(() => {
        if (req === latest.current) setLoading(false)
      })
  }, [rangeFrom, rangeTo])

  useEffect(() => {
    void load()
  }, [load])

  // a new department starts again from its top 20
  useEffect(() => setShowAll(false), [deptFilter])

  const activePreset = PRESETS.find((p) => {
    const [f, t] = p.range()
    return f === fromDate && t === toDate
  })?.id

  const report = useMemo(
    () => (rawReport ? withValues(rawReport, prices ?? new Map()) : null),
    [rawReport, prices],
  )
  const hasValue = !!report && report.pricedProducts > 0
  const byValue = sortBy === 'value' && hasValue

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
  const maxValue = useMemo(
    () => Math.max(1, ...(report?.groups ?? []).flatMap((g) => g.products.map((p) => p.value ?? 0))),
    [report],
  )

  const topDept = useMemo(() => (report ? deptBars(report)[0] : undefined), [report])
  const ranked = useMemo(() => {
    const list = report ? rankProducts(report, deptFilter) : []
    // most money first; products without a price keep their count order at the end
    return byValue ? [...list].sort((a, b) => (b.value ?? -1) - (a.value ?? -1)) : list
  }, [report, deptFilter, byValue])
  const deptLabel = useMemo(
    () => new Map((report?.groups ?? []).map((g) => [g.code, g.label] as const)),
    [report],
  )
  const trend = useMemo(
    () => (report ? shortageTrend(report, rangeFrom, rangeTo) : null),
    [report, rangeFrom, rangeTo],
  )

  async function uploadPrices(file: File) {
    setPriceMsg(undefined)
    setUploading(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await readFile(file))
      let parsed: ReturnType<typeof parsePriceSheet> | null = null
      let lastError: Error | null = null
      for (const name of wb.SheetNames) {
        try {
          parsed = parsePriceSheet(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1 }))
          if (parsed.rows.length > 0) break
        } catch (e) {
          lastError = e as Error
        }
      }
      if (!parsed || parsed.rows.length === 0) throw lastError ?? new Error('ไม่มีแถวที่มีทั้งรหัสสินค้าและราคา')
      await saveItemPrices(parsed.rows)
      if (rawReport) setPrices(await getItemPrices(itemIds(rawReport)))
      setPriceMsg(
        flash.ok(
          `บันทึกราคา ${parsed.rows.length.toLocaleString()} รายการแล้ว` +
            (parsed.skipped ? ` (ข้าม ${parsed.skipped} แถวที่ไม่มีรหัสหรือราคา)` : ''),
        ),
      )
    } catch (e) {
      setPriceMsg(flash.error('อัปโหลดราคาไม่สำเร็จ: ' + (e as Error).message))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function exportExcel() {
    if (!report) return
    setExportMsg(undefined)
    try {
      await downloadShortageExcel(report, rangeFrom, rangeTo)
    } catch (e) {
      setExportMsg(flash.error('ดาวน์โหลด Excel ไม่สำเร็จ: ' + (e as Error).message))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="รายงานของขาด"
        icon={ChartBar}
        actions={
          <>
            {lead && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  aria-label="ไฟล์ราคาสินค้า"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void uploadPrices(f)
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  <UploadSimple size={18} aria-hidden="true" />
                  {uploading ? 'กำลังบันทึกราคา…' : 'อัปโหลดราคา'}
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void exportExcel()}
              disabled={!report || report.groups.length === 0}
            >
              <DownloadSimple size={18} aria-hidden="true" />
              ดาวน์โหลด Excel
            </button>
          </>
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
      <Notice flash={priceMsg} />

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
        <div
          className={'flex flex-col gap-5 transition-opacity ' + (loading ? 'opacity-60' : '')}
          aria-busy={loading}
        >
          {prices && (
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 rounded-lg bg-brand-soft px-4 py-3 ring-1 ring-brand/25">
              <div>
                <p className="text-xs font-medium text-brand-ink">มูลค่าที่ขาด (ราคาคร่าวๆ)</p>
                <p className="figure text-[2rem] leading-tight text-ink">
                  {hasValue ? formatBaht(report.value) : '–'}
                </p>
              </div>
              <p className="text-xs text-ink-soft">
                {hasValue
                  ? `คิดจาก ${report.pricedProducts} จาก ${report.productCount} รายการที่มีราคา`
                  : lead
                    ? 'ยังไม่มีราคา: กด "อัปโหลดราคา" แล้วเลือก Excel ที่มีคอลัมน์รหัสสินค้ากับราคา'
                    : 'ยังไม่มีราคาสินค้า'}
                {hasValue && report.pricedProducts < report.productCount && lead && (
                  <> · ใส่ราคาที่ขาดได้ในคอลัมน์ "ราคาต่อหน่วย" ของไฟล์ที่ดาวน์โหลด แล้วอัปโหลดกลับ</>
                )}
              </p>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <StatTile label="สินค้าที่ขาด" value={report.productCount} />
            <StatTile label="ขาดทั้งหมด (ครั้ง)" value={report.occurrenceCount} emphasis />
            <StatTile label="ออเดอร์ที่ได้รับผลกระทบ" value={report.affectedOrderCount} />
            <StatTile
              label="แผนกที่ขาดบ่อยสุด"
              value={
                topDept ? (
                  <span className="flex items-center gap-2 text-base">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: DEPT_COLORS[topDept.code] }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{topDept.label}</span>
                  </span>
                ) : (
                  '–'
                )
              }
            />
          </dl>

          {trend && <TrendColumnChart key={`${rangeFrom}_${rangeTo}`} trend={trend} />}

          <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="มุมมอง" className="inline-flex w-fit overflow-hidden rounded-lg border border-line-strong">
            {(
              [
                ['rank', 'รวมทุกแผนก'],
                ['dept', 'แยกตามแผนก'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={
                  'min-h-[2.5rem] px-4 text-sm ' + (view === v ? 'bg-ink font-semibold text-surface' : 'bg-surface text-ink-soft')
                }
              >
                {label}
              </button>
            ))}
          </div>
          {hasValue && (
            <div role="group" aria-label="เรียงตาม" className="inline-flex w-fit overflow-hidden rounded-lg border border-line-strong">
              {(
                [
                  ['count', 'ขาดบ่อยสุด'],
                  ['value', 'มูลค่าสูงสุด'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={sortBy === v}
                  onClick={() => setSortBy(v)}
                  className={
                    'min-h-[2.5rem] px-4 text-sm ' + (sortBy === v ? 'bg-ink font-semibold text-surface' : 'bg-surface text-ink-soft')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          </div>

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
                color={DEPT_COLORS[g.code]}
              />
            ))}
          </div>

          {view === 'rank' ? (
            <section aria-label="อันดับสินค้าที่ขาด" className="table-wrap">
              <ol>
                {(showAll ? ranked : ranked.slice(0, TOP_N)).map((p, i) => (
                  <ProductRow
                    key={`${p.dept}:${p.key}`}
                    rank={i + 1}
                    product={p}
                    maxCount={maxCount}
                    maxValue={byValue ? maxValue : undefined}
                    deptName={deptLabel.get(p.dept)}
                    open={openKey === `${p.dept}:${p.key}`}
                    onToggle={() => setOpenKey((cur) => (cur === `${p.dept}:${p.key}` ? null : `${p.dept}:${p.key}`))}
                  />
                ))}
              </ol>
              {!showAll && ranked.length > TOP_N && (
                <button
                  type="button"
                  className="w-full border-t border-line py-3 text-sm font-semibold text-brand-ink hover:bg-paper"
                  onClick={() => setShowAll(true)}
                >
                  แสดงทั้งหมด {ranked.length} รายการ
                </button>
              )}
            </section>
          ) : (
          <div className="flex flex-col gap-4">
            {visibleGroups.map((g) => (
              <DeptSection
                key={g.code}
                group={g}
                from={rangeFrom}
                to={rangeTo}
                maxCount={maxCount}
                maxValue={byValue ? maxValue : undefined}
                openKey={openKey}
                onToggle={(k) => setOpenKey((cur) => (cur === k ? null : k))}
              />
            ))}
          </div>
          )}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  color,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  color?: string
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
      {color && (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-on/70"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      )}
      {label}
      <span
        className={
          'tnum rounded-full px-1.5 text-xs ' + (active ? 'bg-on/20' : 'bg-paper text-ink-soft')
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
  maxValue,
  openKey,
  onToggle,
}: {
  group: PricedGroup
  from: string
  to: string
  maxCount: number
  maxValue?: number
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
    <section
      className="card overflow-hidden border-l-4 p-0 sm:p-0"
      style={{ borderLeftColor: DEPT_COLORS[g.code] }}
      aria-label={`แผนก ${g.label}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1 text-sm font-semibold tracking-wide text-ink ring-1 ring-line">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: DEPT_COLORS[g.code] }}
              aria-hidden="true"
            />
            {g.label}
          </span>
          <p className="text-sm text-ink-soft">
            <span className="tnum font-semibold text-ink">{g.products.length}</span> รายการ · ขาด{' '}
            <span className="tnum font-semibold text-ink">{g.occurrenceCount}</span> ครั้ง
            {g.value > 0 && (
              <>
                {' '}· ≈ <span className="tnum font-semibold text-ink">{formatBaht(g.value)}</span>
              </>
            )}
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
        {(maxValue ? [...g.products].sort((a, b) => (b.value ?? -1) - (a.value ?? -1)) : g.products).map((p, i) => (
          <ProductRow
            key={p.key}
            rank={i + 1}
            product={p}
            maxCount={maxCount}
            maxValue={maxValue}
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
  maxValue,
  open,
  onToggle,
  deptName,
}: {
  rank: number
  product: PricedProduct
  maxCount: number
  /** set when ranking by value: the bar shows the value instead of how often */
  maxValue?: number
  open: boolean
  onToggle: () => void
  /** shown in the across-departments list, where rows mix departments */
  deptName?: string
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
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-soft">
            {p.itemId && <span className="tnum">{p.itemId}</span>}
            {deptName && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: DEPT_COLORS[p.dept] }}
                  aria-hidden="true"
                />
                {deptName}
              </span>
            )}
          </span>
          <span className="block h-1.5 max-w-xs overflow-hidden rounded-full bg-line" aria-hidden="true">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${(maxValue ? (p.value ?? 0) / maxValue : p.orderCount / maxCount) * 100}%`,
                backgroundColor: DEPT_COLORS[p.dept],
              }}
            />
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="text-sm text-ink-soft">
            ขาด <span className="tnum text-xl font-semibold text-ink">{p.orderCount}</span> ครั้ง
          </span>
          <span className="tnum text-xs text-ink-soft">รวม {formatQty(p.totalQty)}</span>
          {p.value != null && (
            <span
              className="tnum text-xs font-semibold text-ink"
              title={`ราคาคร่าวๆ ${formatBaht(p.unitPrice!)} ต่อหน่วย`}
            >
              ≈ {formatBaht(p.value)}
            </span>
          )}
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
                    <Link className="link num" to={`/order/${d.orderId}`}>
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
