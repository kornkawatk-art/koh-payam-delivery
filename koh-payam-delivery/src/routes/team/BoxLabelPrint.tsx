import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer } from '@phosphor-icons/react'
import { StickerFace } from '../../components/StickerPrint'
import { listBoxLabelsForDay, markBoxLabelPacked, type BoxLabelRow } from '../../lib/api/boxLabels'
import { formatDateTimeTH, todayLocalISO } from '../../lib/format'
import { stickerList, toCount, type Sticker } from '../../lib/stickers'

type Counts = { paper: number; foam: number; piece: number }
const KINDS: [keyof Counts, string][] = [['paper', 'ลังกระดาษ'], ['foam', 'ลังโฟม'], ['piece', 'ชิ้น']]

/** One PO: its box name large, the counts, and the print button (a reprint saves the counts again) */
function BoxCard({ row, onPrint }: { row: BoxLabelRow; onPrint: (row: BoxLabelRow, c: Counts) => Promise<void> }) {
  const [text, setText] = useState<Record<keyof Counts, string>>({
    paper: row.paper_box_count ? String(row.paper_box_count) : '',
    foam: row.foam_box_count ? String(row.foam_box_count) : '',
    piece: row.piece_count ? String(row.piece_count) : '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const counts: Counts = { paper: toCount(text.paper), foam: toCount(text.foam), piece: toCount(text.piece) }
  const n = stickerList(counts).length
  const done = row.packed_at ? (row.paper_box_count ?? 0) + (row.foam_box_count ?? 0) + (row.piece_count ?? 0) : 0

  async function print() {
    setBusy(true)
    setErr('')
    try {
      await onPrint(row, counts)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article aria-label={`${row.makro_order_no} ${row.label}`} className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-bold">{row.label}</p>
          <p className="text-sm text-ink-soft">
            <span className="font-mono">{row.makro_order_no}</span> · {row.customer_name}
          </p>
        </div>
        {row.packed_at && <span className="badge badge-ok shrink-0">พิมพ์แล้ว</span>}
      </div>
      {row.note && <p className="alert alert-warn text-sm">หมายเหตุจาก sale: {row.note}</p>}
      {row.packed_at && (
        <p className="text-sm text-ink-soft">
          พิมพ์แล้ว {done} ลัง{row.packed_by_name ? ` · ${row.packed_by_name}` : ''} · {formatDateTimeTH(row.packed_at)}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {KINDS.map(([k, label]) => (
          <label key={k} className="field">
            <span className="field-label">{label}</span>
            <input aria-label={label} inputMode="numeric" value={text[k]} onChange={(e) => setText({ ...text, [k]: e.target.value.replace(/\D/g, '') })} />
          </label>
        ))}
      </div>
      {err && <p className="alert alert-danger" role="alert">{err}</p>}
      <button type="button" className="btn btn-primary" disabled={busy || n === 0} onClick={() => void print()}>
        <Printer size={18} aria-hidden="true" />
        พิมพ์สติ๊กเกอร์ ({n} ดวง)
      </button>
    </article>
  )
}

/**
 * สติ๊กเกอร์หน้าลัง: city / Myanmar POs that sale named in O2O Desk. The packer enters the boxes and prints one
 * 50x30 mm sticker per box (the name, "1 / 3 · ลังกระดาษ", the PO), instead of writing on each box by hand; the
 * counts go back to sale.
 */
export default function BoxLabelPrint() {
  const [day, setDay] = useState(todayLocalISO())
  const [rows, setRows] = useState<BoxLabelRow[] | null>(null)
  const [error, setError] = useState('')
  const [printing, setPrinting] = useState<{ name: string; po: string; stickers: Sticker[] } | null>(null)

  const load = useCallback(() => {
    if (!day) return
    setError('')
    listBoxLabelsForDay(day).then(setRows).catch((e) => setError((e as Error).message))
  }, [day])
  useEffect(load, [load])

  // hand the stickers to the browser's print window once they are in the DOM (as StickerPrintDialog does)
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

  async function print(row: BoxLabelRow, c: Counts) {
    await markBoxLabelPacked(row.makro_order_no, c) // saved first, so sale's count never disagrees with the stickers
    setPrinting({ name: row.label, po: row.makro_order_no, stickers: stickerList(c) })
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="page-title">สติ๊กเกอร์หน้าลัง</h1>
        <p className="muted">ออเดอร์ในเมือง / ฝั่งเมียนมาที่ sale ตั้งชื่อหน้าลังไว้ใน O2O Desk ใส่จำนวนลังแล้วพิมพ์ จำนวนจะส่งกลับไปให้ sale เอง</p>
      </header>
      <label className="field max-w-xs">
        <span className="field-label">วันส่ง</span>
        <input type="date" aria-label="วันส่ง" value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
      {rows?.length === 0 && <p className="muted">วันนี้ยังไม่มี PO ที่ sale ตั้งชื่อหน้าลังไว้</p>}
      <div className="flex flex-col gap-3">
        {rows?.map((r) => <BoxCard key={`${r.makro_order_no}:${r.packed_at ?? ''}`} row={r} onPrint={print} />)}
      </div>
      {printing &&
        createPortal(
          <div className="sticker-print-root" data-testid="sticker-print-root">
            <style>{'@page { size: 50mm 30mm; margin: 0; }'}</style>
            {printing.stickers.map((s) => (
              <StickerFace key={s.no} name={printing.name} s={s} po={printing.po} />
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
