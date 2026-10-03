import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from '@phosphor-icons/react'
import { nameFontMm, parseStickerSelection, stickerList, type Sticker } from '../lib/stickers'
import { islandName } from '../lib/islands'
import {
  getShortName,
  saveShortName,
  suggestShortName,
  type CustomerRef,
} from '../lib/api/customerAliases'

type Counts = { paper: number; foam: number; piece: number }

/**
 * One 50 x 30 mm sticker: the island (small, so boat crews load the right
 * boat -- left off while the order's island is still unpicked), the
 * customer's short name, then "3 / 29 · ลังโฟม".
 */
function StickerFace({ name, s, island }: { name: string; s: Sticker; island?: unknown }) {
  const where = islandName(island)
  return (
    <div className="sticker">
      {where && <div className="sticker-island">{where}</div>}
      <div className="sticker-name" style={{ fontSize: `${nameFontMm(name)}mm` }}>
        {name}
      </div>
      <div className="sticker-meta">
        <b>
          {s.no} / {s.total}
        </b>{' '}
        · {s.kind}
      </div>
    </div>
  )
}

/**
 * "พิมพ์สติ๊กเกอร์ (N ดวง)" -- opens the print dialog for this customer's box
 * counts. `beforePrint` runs first (the pack pages save the counts, so the
 * stickers never disagree with what's recorded).
 */
export function StickerPrintButton({
  customer,
  island,
  counts,
  beforePrint,
  disabled,
  className = 'btn btn-secondary w-full sm:w-fit',
}: {
  customer: CustomerRef
  island?: unknown
  counts: Counts
  beforePrint?: () => Promise<void>
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const n = stickerList(counts).length
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled || n === 0}
        onClick={() => setOpen(true)}
      >
        <Printer size={18} aria-hidden="true" />
        พิมพ์สติ๊กเกอร์ ({n} ดวง)
      </button>
      {open && (
        <StickerPrintDialog
          customer={customer}
          island={island}
          counts={counts}
          beforePrint={beforePrint}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

export function StickerPrintDialog({
  customer,
  island,
  counts,
  beforePrint,
  onClose,
}: {
  customer: CustomerRef
  island?: unknown
  counts: Counts
  beforePrint?: () => Promise<void>
  onClose: () => void
}) {
  const all = stickerList(counts)
  const [name, setName] = useState<string | null>(null) // null = still loading the saved name
  const [mode, setMode] = useState<'all' | 'some'>('all')
  const [pick, setPick] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [printing, setPrinting] = useState<Sticker[] | null>(null)

  useEffect(() => {
    let live = true
    getShortName(customer)
      .then((saved) => live && setName(saved ?? suggestShortName(customer.customer_name_en)))
      .catch(() => live && setName(suggestShortName(customer.customer_name_en)))
    return () => {
      live = false
    }
  }, []) // once per opening

  // Hand the stickers to the browser's print window once they're in the DOM;
  // clean up when printing ends.
  useEffect(() => {
    if (!printing) return
    const done = () => {
      document.body.classList.remove('printing-stickers')
      setPrinting(null)
    }
    document.body.classList.add('printing-stickers')
    window.addEventListener('afterprint', done, { once: true })
    const t = window.setTimeout(() => window.print(), 50)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('afterprint', done)
      document.body.classList.remove('printing-stickers')
    }
  }, [printing])

  const trimmed = (name ?? '').trim()
  async function print() {
    setErr('')
    let chosen = all
    if (mode === 'some') {
      const nos = parseStickerSelection(pick, all.length)
      if (!nos) {
        setErr(`ใส่เลขดวงให้ถูก เช่น 7 หรือ 3-5 หรือ 2,9 (มีทั้งหมด ${all.length} ดวง)`)
        return
      }
      chosen = all.filter((s) => nos.includes(s.no))
    }
    setBusy(true)
    try {
      await saveShortName(customer, trimmed) // remembered for this customer's next orders
      await beforePrint?.()
      setPrinting(chosen)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="พิมพ์สติ๊กเกอร์"
    >
      <div className="card flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-b-none sm:rounded-xl">
        <div className="flex items-center justify-between">
          <p className="section-title">พิมพ์สติ๊กเกอร์ ({all.length} ดวง)</p>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="ปิด" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <label className="field">
          <span className="field-label">ชื่อบนสติ๊กเกอร์</span>
          <input
            value={name ?? ''}
            disabled={name === null}
            onChange={(e) => setName(e.target.value)}
            placeholder={name === null ? 'กำลังโหลด…' : 'เช่น JJ'}
          />
          <span className="text-xs text-ink-faint">
            ชื่อย่อที่คนเรือเรียก — ระบบจำไว้ใช้กับลูกค้ารายนี้ครั้งต่อไป
          </span>
        </label>

        {all[0] && trimmed && (
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-xs text-ink-faint">ตัวอย่าง (ขนาดจริง 50×30 มม.)</span>
            <div className="sticker-preview">
              <StickerFace name={trimmed} s={all[0]} island={island} />
            </div>
          </div>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="field-label mb-1">พิมพ์ดวงไหน</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} />
            ทั้งหมด ({all.length} ดวง)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={mode === 'some'} onChange={() => setMode('some')} />
            เฉพาะบางดวง (พิมพ์ซ้ำ)
          </label>
          {mode === 'some' && (
            <input
              aria-label="เลขดวงที่จะพิมพ์"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              placeholder="เช่น 7 หรือ 3-5 หรือ 2,9"
            />
          )}
        </fieldset>

        {err && (
          <p className="alert alert-danger" role="alert">
            {err}
          </p>
        )}

        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary flex-1" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn btn-primary flex-[2]"
            disabled={busy || !trimmed || all.length === 0}
            onClick={() => void print()}
          >
            <Printer size={18} aria-hidden="true" />
            พิมพ์
          </button>
        </div>
      </div>

      {printing &&
        createPortal(
          <div className="sticker-print-root" data-testid="sticker-print-root">
            {/* page size only while stickers print, so nothing else is affected */}
            <style>{'@page { size: 50mm 30mm; margin: 0; }'}</style>
            {printing.map((s) => (
              <StickerFace key={s.no} name={trimmed} s={s} island={island} />
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
