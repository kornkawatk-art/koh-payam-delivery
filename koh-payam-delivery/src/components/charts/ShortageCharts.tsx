import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { DeptGroupCode } from '../../lib/departments'
import { niceTicks, type DeptBar, type Trend, type TrendBucket } from '../../lib/shortageCharts'

/*
 * Both charts are plain HTML/CSS (no chart library): bars stay crisp at any
 * width, reflow on phones, and every mark is a real <button> for touch and
 * keyboard. One measure each, colored by MAGNITUDE on a one-hue violet ramp
 * (the page's own accent) -- more shortages, darker bar -- with a small
 * น้อย->มาก key. The ramp is violet-500/700/900: validated as an ordinal
 * scale (lightness monotone, adjacent steps far enough apart, light end
 * 4.23:1 on the white card); violet-400 was too light (2.72:1). Values
 * are always reachable without hovering: direct labels on the department
 * bars, a readout line on the trend chart, and a screen-reader table.
 */

// Literal class names so Tailwind's JIT sees them.
const RAMP = ['bg-violet-500', 'bg-violet-700', 'bg-violet-900'] as const

/** Ramp step for a value: light violet for the lowest third of the max, darkest for the top third. */
export function rampClass(value: number, max: number): (typeof RAMP)[number] {
  const r = max > 0 ? value / max : 0
  return r > 2 / 3 ? RAMP[2] : r > 1 / 3 ? RAMP[1] : RAMP[0]
}

/** "น้อย ▮▮▮ มาก" -- how to read the bar colors. */
function RampKey() {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-ink-faint" aria-hidden="true">
      น้อย
      <span className="flex gap-0.5">
        {RAMP.map((c) => (
          <span key={c} className={`h-2.5 w-3 rounded-sm ${c}`} />
        ))}
      </span>
      มาก
    </span>
  )
}

const dayFmt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' })
const shortDate = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00`))
const bucketLabel = (b: TrendBucket) =>
  b.start === b.end ? shortDate(b.start) : `${shortDate(b.start)} – ${shortDate(b.end)}`

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <figure className="card flex min-w-0 flex-col gap-4">
      <figcaption className="flex items-start justify-between gap-3">
        <span>
          <span className="section-title block">{title}</span>
          <span className="block text-xs text-ink-soft">{subtitle}</span>
        </span>
        <RampKey />
      </figcaption>
      {children}
    </figure>
  )
}

/** Horizontal bars: short occurrences per department, most first. Tap a bar to filter the list. */
export function DeptBarChart({
  bars,
  active,
  onSelect,
}: {
  bars: DeptBar[]
  active: DeptGroupCode | 'ALL'
  onSelect: (code: DeptGroupCode | 'ALL') => void
}) {
  const max = Math.max(1, ...bars.map((b) => b.occurrences))
  return (
    <ChartCard title="ขาดตามแผนก (ครั้ง)" subtitle="กดที่แผนกเพื่อดูรายการด้านล่างเฉพาะแผนกนั้น">
      <ul className="flex flex-col gap-1">
        {bars.map((b) => {
          const selected = active === b.code
          // Emphasis: once one department is picked, the rest step back to gray.
          const tone =
            active === 'ALL' || selected ? rampClass(b.occurrences, max) : 'bg-line-strong'
          return (
            <li key={b.code}>
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`${b.label}: ขาด ${b.occurrences} ครั้ง, ${b.products} รายการ`}
                onClick={() => onSelect(selected ? 'ALL' : b.code)}
                className={
                  'group grid min-h-[2.75rem] w-full grid-cols-[4.5rem_1fr_auto] items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-paper ' +
                  (selected ? 'bg-paper ring-1 ring-line-strong' : '')
                }
              >
                <span className="truncate text-sm font-semibold text-ink">{b.label}</span>
                <span className="relative h-5">
                  <span
                    className={`absolute inset-y-0 left-0 rounded-r-[4px] transition-[width,background-color] duration-300 group-hover:brightness-110 ${tone}`}
                    style={{ width: `max(2px, ${(b.occurrences / max) * 100}%)` }}
                  />
                </span>
                <span className="text-sm text-ink-soft">
                  <span className="tnum font-semibold text-ink">{b.occurrences}</span>
                  <span className="ml-1 hidden text-xs sm:inline">· {b.products} รายการ</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </ChartCard>
  )
}

/** Columns: short occurrences per ship day (or per week for long ranges). */
export function TrendColumnChart({ trend }: { trend: Trend }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const { buckets, unit } = trend
  const ticks = niceTicks(Math.max(0, ...buckets.map((b) => b.count)))
  const top = ticks[ticks.length - 1]
  const peakIdx = buckets.reduce((best, b, i) => (b.count > buckets[best].count ? i : best), 0)
  const total = buckets.reduce((n, b) => n + b.count, 0)
  const shown = activeIdx ?? (total > 0 ? peakIdx : null)
  const n = buckets.length
  // No buckets = no valid range yet (e.g. a date field cleared mid-edit).
  const xLabels = n === 0 ? [] : n === 1 ? [0] : n === 2 ? [0, 1] : [0, Math.floor((n - 1) / 2), n - 1]

  // The crosshair finds the X: a pointer anywhere over the plot snaps to the
  // nearest column, so a finger can scrub across 30 narrow days on a phone
  // instead of having to land on a 9px bar.
  function scrub(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse' && e.type === 'pointermove' && e.buttons === 0) return
    const r = plotRef.current?.getBoundingClientRect()
    if (!r || r.width === 0 || n === 0) return
    const i = Math.floor(((e.clientX - r.left) / r.width) * n)
    setActiveIdx(Math.min(n - 1, Math.max(0, i)))
  }

  return (
    <ChartCard
      title={unit === 'day' ? 'ขาดตามวันจัดส่ง (ครั้ง)' : 'ขาดรายสัปดาห์ (ครั้ง)'}
      subtitle={
        unit === 'day'
          ? 'แตะหรือชี้ที่แท่งเพื่อดูจำนวนของวันนั้น'
          : 'ช่วงยาวเกิน 31 วัน แสดงเป็นรายสัปดาห์ — แตะที่แท่งเพื่อดูจำนวน'
      }
    >
      {/* Readout: the hovered/tapped column, else the peak. Values lead, labels follow. */}
      <p className="flex min-h-[1.75rem] items-baseline gap-2" aria-live="polite">
        {shown === null ? (
          <span className="text-sm text-ink-soft">ไม่มีของขาดในช่วงนี้</span>
        ) : (
          <>
            <span className="text-xl font-semibold text-ink">{buckets[shown].count}</span>
            <span className="text-sm text-ink-soft">
              ครั้ง · {bucketLabel(buckets[shown])}
              {activeIdx === null && ' (สูงสุด)'}
            </span>
          </>
        )}
      </p>

      <div className="flex gap-2">
        {/* Y axis: clean ticks, right-aligned, tabular */}
        <div className="relative h-40 w-6 shrink-0 sm:h-48" aria-hidden="true">
          {ticks.map((t) => (
            <span
              key={t}
              className="tnum absolute right-0 translate-y-1/2 text-[11px] leading-none text-ink-faint"
              style={{ bottom: `${(t / top) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div
            ref={plotRef}
            className="relative h-40 touch-pan-y sm:h-48"
            onPointerDown={scrub}
            onPointerMove={scrub}
            onMouseLeave={() => setActiveIdx(null)}
          >
            {/* hairline gridlines, recessive */}
            {ticks.map((t) => (
              <span
                key={t}
                aria-hidden="true"
                className={'absolute inset-x-0 h-px ' + (t === 0 ? 'bg-line-strong' : 'bg-line')}
                style={{ bottom: `${(t / top) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end">
              {buckets.map((b, i) => {
                const active = i === shown
                return (
                  <button
                    key={b.start}
                    type="button"
                    aria-label={`${bucketLabel(b)}: ขาด ${b.count} ครั้ง`}
                    onFocus={() => setActiveIdx(i)}
                    onClick={() => setActiveIdx(i)}
                    // Hit target = the whole column slot, not just the painted bar.
                    className="relative flex h-full min-w-0 flex-1 items-end justify-center px-px focus-visible:outline-offset-0"
                  >
                    {i === peakIdx && b.count > 0 && (
                      <span
                        className="tnum absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold text-ink-soft"
                        style={{ bottom: `calc(${(b.count / top) * 100}% + 4px)` }}
                        aria-hidden="true"
                      >
                        {b.count}
                      </span>
                    )}
                    <span
                      className={
                        'block w-full max-w-[24px] rounded-t-[4px] transition-shadow ' +
                        rampClass(b.count, top) +
                        (active ? ' ring-2 ring-violet-300 ring-offset-1' : '')
                      }
                      style={{ height: b.count ? `${(b.count / top) * 100}%` : 0 }}
                    />
                  </button>
                )
              })}
            </div>
          </div>

          {/* X axis: first / middle / last only, so labels never collide on a phone */}
          <div className="relative mt-1.5 h-4" aria-hidden="true">
            {xLabels.map((i) => (
              <span
                key={i}
                className={
                  'absolute top-0 whitespace-nowrap text-[11px] text-ink-faint ' +
                  (i === 0 ? 'left-0' : i === n - 1 ? 'right-0' : '-translate-x-1/2')
                }
                style={i !== 0 && i !== n - 1 ? { left: `${((i + 0.5) / n) * 100}%` } : undefined}
              >
                {shortDate(buckets[i].start)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <table className="sr-only">
        <caption>จำนวนครั้งที่ขาดตาม{unit === 'day' ? 'วันจัดส่ง' : 'สัปดาห์'}</caption>
        <thead>
          <tr>
            <th>ช่วง</th>
            <th>ครั้ง</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.start}>
              <td>{bucketLabel(b)}</td>
              <td>{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ChartCard>
  )
}
