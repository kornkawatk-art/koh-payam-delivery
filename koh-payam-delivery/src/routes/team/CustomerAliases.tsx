import { useEffect, useMemo, useState } from 'react'
import { Tag } from '@phosphor-icons/react'
import { PageHeader } from '../../components/ui/PageHeader'
import { SkeletonRows } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { Notice, flash, type Flash } from '../../components/ui/Notice'
import { StatTile } from '../../components/ui/Stat'
import { StickerFace } from '../../components/StickerPrint'
import { formatDateTH } from '../../lib/format'
import {
  listCustomerAliases,
  saveShortName,
  suggestShortName,
  type CustomerAliasRow,
} from '../../lib/api/customerAliases'

type Tab = 'missing' | 'set' | 'all'

/** Suggested short names: the first word, then the whole name (no duplicates). */
const suggestionsFor = (name: string) =>
  Array.from(new Set([suggestShortName(name), name.trim()].filter(Boolean)))

/**
 * Manager's list of every customer's sticker short name ("JJ Payam" -> "JJ").
 * Opens on the customers still missing one; each can take the suggested name
 * in one tap, or be typed with a live sticker preview. Packers can also set a
 * name at the print button.
 */
export default function CustomerAliases() {
  const [rows, setRows] = useState<CustomerAliasRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab | null>(null) // null = pick from the data once loaded
  const [msg, setMsg] = useState<Flash>()

  useEffect(() => {
    listCustomerAliases()
      .then(setRows)
      .catch(() => setFailed(true))
  }, [])

  const missing = (rows ?? []).filter((r) => !r.shortName).length
  const total = rows?.length ?? 0
  const activeTab: Tab = tab ?? (missing > 0 ? 'missing' : 'all')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (rows ?? []).filter(
      (r) =>
        (activeTab === 'all' || (activeTab === 'missing' ? !r.shortName : !!r.shortName)) &&
        (!needle ||
          r.name.toLowerCase().includes(needle) ||
          (r.phone ?? '').includes(needle) ||
          (r.shortName ?? '').toLowerCase().includes(needle)),
    )
  }, [rows, q, activeTab])

  async function save(r: CustomerAliasRow, shortName: string): Promise<boolean> {
    const name = shortName.trim()
    setMsg(undefined)
    try {
      await saveShortName({ customer_phone: r.phone, customer_name_en: r.name }, name)
      setRows((all) => (all ?? []).map((x) => (x.key === r.key ? { ...x, shortName: name } : x)))
      setMsg(flash.ok(`ตั้งชื่อย่อ ${r.name} เป็น “${name}” แล้ว`))
      return true
    } catch (e) {
      setMsg(flash.error((e as Error).message))
      return false
    }
  }

  const TABS: [Tab, string, number][] = [
    ['missing', 'ยังไม่ได้ตั้ง', missing],
    ['set', 'ตั้งแล้ว', total - missing],
    ['all', 'ทั้งหมด', total],
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="ชื่อย่อลูกค้า" icon={Tag} />
      <p className="muted">
        ชื่อที่พิมพ์ตัวใหญ่บนสติ๊กเกอร์ติดลัง (ชื่อที่คนเรือเรียก) — ตั้งครั้งเดียว ใช้กับทุกออเดอร์ของลูกค้ารายนั้น
        คนแพ็คตั้ง/แก้ได้ตอนกดพิมพ์สติ๊กเกอร์ด้วย
      </p>

      {failed ? (
        <p className="alert alert-danger">โหลดรายชื่อลูกค้าไม่สำเร็จ</p>
      ) : !rows ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          <section aria-label="สรุปชื่อย่อ">
            <dl className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <StatTile label="ตั้งแล้ว" value={`${total - missing} / ${total} ราย`} />
                <span className="block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-ok"
                    style={{ width: `${total ? ((total - missing) / total) * 100 : 0}%` }}
                  />
                </span>
              </div>
              <StatTile label="ยังไม่ได้ตั้ง" value={`${missing} ราย`} warn={missing > 0} />
            </dl>
          </section>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {TABS.map(([t, label, n]) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={activeTab === t}
                  onClick={() => setTab(t)}
                  className={
                    'btn btn-secondary btn-sm rounded-full ' + (activeTab === t ? 'border-ink text-ink' : 'text-ink-soft')
                  }
                >
                  {label}
                  <span className="num text-xs text-ink-faint">{n}</span>
                </button>
              ))}
            </div>
            <input
              placeholder="ค้นหาชื่อลูกค้า / เบอร์ / ชื่อย่อ"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <Notice flash={msg} />

          {shown.length === 0 ? (
            <EmptyState
              icon={Tag}
              title={activeTab === 'missing' && !q ? 'ตั้งชื่อย่อครบทุกรายแล้ว' : 'ไม่พบลูกค้า'}
            />
          ) : (
            <ul className="table-wrap divide-y divide-line">
              {shown.map((r) => (
                <AliasRow key={r.key} row={r} onSave={(name) => save(r, name)} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function AliasRow({ row: r, onSave }: { row: CustomerAliasRow; onSave: (name: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(r.shortName ?? '')
  const [busy, setBusy] = useState(false)
  const suggestions = suggestionsFor(r.name)
  const dirty = value.trim() !== '' && value.trim() !== (r.shortName ?? '')

  async function save(name: string) {
    setBusy(true)
    const ok = await onSave(name)
    setBusy(false)
    if (ok) setEditing(false)
  }

  return (
    <li className={editing ? 'bg-paper' : undefined}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_15rem] sm:gap-x-4">
        <span className="min-w-0">
          <span className="block truncate font-semibold">{r.name}</span>
          <span className="block text-xs text-ink-soft">
            <span className="num">{r.phone || 'ไม่มีเบอร์'}</span>
            <span className="sm:hidden"> · ล่าสุด {formatDateTH(r.lastShipDate)}</span>
          </span>
        </span>
        <span className="hidden text-xs text-ink-soft sm:block">ล่าสุด {formatDateTH(r.lastShipDate)}</span>
        <span className="justify-self-end sm:justify-self-start">
          {r.shortName ? (
            <span className="sticker-chip inline-flex min-w-[5rem] items-center justify-center rounded-md border-2 border-ink bg-surface px-2.5 py-0.5 font-bold text-ink">
              {r.shortName}
            </span>
          ) : (
            <span className="inline-flex min-w-[5rem] items-center justify-center rounded-md border-2 border-dashed border-warn/40 bg-warn-soft px-2.5 py-0.5 text-xs text-warn-ink">
              ยังไม่ได้ตั้ง
            </span>
          )}
        </span>
        <span
          className={
            'flex items-center justify-end gap-2 sm:col-span-1 ' + (r.shortName ? '' : 'col-span-3')
          }
        >
          {!r.shortName && !editing && (
            <button
              type="button"
              className="btn btn-secondary btn-sm flex-1 sm:flex-none"
              disabled={busy || !suggestions[0]}
              onClick={() => void save(suggestions[0])}
            >
              ใช้ “{suggestions[0]}”
            </button>
          )}
          {!editing && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setValue(r.shortName ?? '')
                setEditing(true)
              }}
            >
              {r.shortName ? 'แก้' : 'พิมพ์เอง'}
            </button>
          )}
        </span>
      </div>

      {editing && (
        <div className="flex flex-wrap items-center gap-4 px-4 pb-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input
              aria-label={`ชื่อย่อของ ${r.name}`}
              className="max-w-xs font-semibold"
              value={value}
              placeholder={`เช่น ${suggestions[0] ?? ''}`}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && dirty) void save(value)
              }}
              autoFocus
            />
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
              ชื่อแนะนำ
              {suggestions.map((s) => (
                <button key={s} type="button" className="btn btn-secondary btn-sm" onClick={() => setValue(s)}>
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!dirty || busy}
                onClick={() => void save(value)}
              >
                บันทึก
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
                ยกเลิก
              </button>
            </div>
          </div>
          <figure className="flex flex-col items-center gap-1" aria-label="ตัวอย่างบนสติ๊กเกอร์">
            <div className="sticker-preview">
              <StickerFace name={value.trim() || '—'} s={{ no: 1, total: 3, kind: 'ลังกระดาษ' }} />
            </div>
            <figcaption className="text-xs text-ink-soft">ตัวอย่างบนสติ๊กเกอร์</figcaption>
          </figure>
        </div>
      )}
    </li>
  )
}
