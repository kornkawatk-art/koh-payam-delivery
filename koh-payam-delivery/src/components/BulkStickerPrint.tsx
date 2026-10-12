import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from '@phosphor-icons/react'
import { StickerFace } from './StickerPrint'
import { stickerList, type Sticker } from '../lib/stickers'
import { islandName } from '../lib/islands'
import type { StickerJob } from '../lib/bulkStickers'
import { getShortNames, saveShortName, suggestShortName } from '../lib/api/customerAliases'
import { markStickersPrinted } from '../lib/api/stickerPrints'

type Printable = { key: string; name: string; island: string | null; s: Sticker }

const refOf = (j: StickerJob) => ({ customer_phone: j.phone, customer_name_en: j.name })

/**
 * "พิมพ์สติ๊กเกอร์ทั้งหมด": every customer of the day in one print run. Those
 * not printed yet are ticked; already-printed ones sit below for a reprint.
 * Short names are editable here (a guessed one is flagged) and remembered.
 */
export function BulkStickerDialog({
  jobs,
  onClose,
  onPrinted,
}: {
  jobs: StickerJob[]
  onClose: () => void
  onPrinted: (warning?: string) => void
}) {
  // undefined = still loading saved names
  const [names, setNames] = useState<Record<string, string> | undefined>(undefined)
  const [guessed, setGuessed] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<Set<string>>(() => new Set(jobs.filter((j) => !j.printed).map((j) => j.key)))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [printing, setPrinting] = useState<Printable[] | null>(null)

  useEffect(() => {
    let live = true
    getShortNames(jobs.map(refOf))
      .catch(() => new Map<string, string>())
      .then((saved) => {
        if (!live) return
        const n: Record<string, string> = {}
        const g = new Set<string>()
        for (const j of jobs) {
          const s = saved.get(j.key)
          n[j.key] = s ?? suggestShortName(j.name)
          if (!s) g.add(j.key)
        }
        setNames(n)
        setGuessed(g)
      })
    return () => {
      live = false
    }
  }, []) // once per opening

  // Same hand-off to the browser's print window as the single-customer dialog.
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

  const chosen = jobs.filter((j) => picked.has(j.key))
  const total = useMemo(
    () => chosen.reduce((n, j) => n + j.counts.paper + j.counts.foam + j.counts.piece, 0),
    [chosen],
  )
  const missingName = chosen.some((j) => !(names?.[j.key] ?? '').trim())

  function toggle(key: string) {
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function print() {
    if (!names) return
    setErr('')
    setBusy(true)
    try {
      for (const j of chosen) await saveShortName(refOf(j), names[j.key].trim())
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
      return
    }
    setPrinting(
      chosen.flatMap((j) =>
        stickerList(j.counts).map((s) => ({ key: j.key, name: names[j.key].trim(), island: j.island, s })),
      ),
    )
    let warning: string | undefined
    try {
      await markStickersPrinted(chosen.flatMap((j) => j.orders))
    } catch (e) {
      warning = (e as Error).message
    }
    setBusy(false)
    onPrinted(warning)
  }

  const section = (title: string, list: StickerJob[]) =>
    list.length > 0 && (
      <fieldset className="flex flex-col gap-2">
        <legend className="field-label mb-1">
          {title} ({list.length})
        </legend>
        {list.map((j) => {
          const n = j.counts.paper + j.counts.foam + j.counts.piece
          return (
            <div key={j.key} className="flex items-center gap-3 rounded-lg border border-line p-2.5 text-sm">
              <input
                type="checkbox"
                aria-label={j.name}
                checked={picked.has(j.key)}
                onChange={() => toggle(j.key)}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-medium">{j.name}</span>
                <span className="text-xs text-ink-soft">
                  {islandName(j.island) ?? 'ยังไม่ระบุเกาะ'} · {n} ดวง
                  {guessed.has(j.key) && <span className="ml-1.5 text-warn-ink">ชื่อที่ระบบเดา</span>}
                </span>
              </div>
              <input
                className="w-24"
                aria-label={`ชื่อย่อ: ${j.name}`}
                value={names?.[j.key] ?? ''}
                disabled={!names}
                onChange={(e) => setNames((m) => ({ ...(m ?? {}), [j.key]: e.target.value }))}
              />
            </div>
          )
        })}
      </fieldset>
    )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="พิมพ์สติ๊กเกอร์ทั้งหมด"
    >
      <div className="card flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-b-none sm:rounded-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">พิมพ์สติ๊กเกอร์ทั้งหมด</h2>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="ปิด" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {jobs.length === 0 && <p className="muted text-sm">ยังไม่มีออเดอร์ที่แพ็คเสร็จให้พิมพ์</p>}
        {section('ยังไม่ได้พิมพ์', jobs.filter((j) => !j.printed))}
        {section('พิมพ์แล้ว (ติ๊กเพื่อพิมพ์ซ้ำ)', jobs.filter((j) => j.printed))}

        {err && (
          <p className="alert alert-danger" role="alert">
            {err}
          </p>
        )}

        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !names || total === 0 || missingName}
          onClick={() => void print()}
        >
          <Printer size={18} aria-hidden="true" />
          พิมพ์ {total} ดวง
        </button>
      </div>

      {printing &&
        createPortal(
          <div className="sticker-print-root" data-testid="sticker-print-root">
            <style>{'@page { size: 50mm 30mm; margin: 0; }'}</style>
            {printing.map((p) => (
              <StickerFace key={`${p.key}-${p.s.no}`} name={p.name} s={p.s} island={p.island} />
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
