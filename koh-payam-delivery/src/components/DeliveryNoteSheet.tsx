import { useEffect, type ReactNode } from 'react'
import {
  DESTINATION,
  NOTE_LABELS,
  noteCodes,
  noteDate,
  noteDateTime,
  qtyText,
  shortQty,
  type DeliveryNote,
  type NoteLang,
} from '../lib/deliveryNote'
import './deliveryNote.css'

const MYANMAR_FONT = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Myanmar:wght@400;500;600;700&display=swap'

/** The Myanmar face is loaded only when a Myanmar note is shown */
function useMyanmarFont(on: boolean) {
  useEffect(() => {
    if (!on || document.querySelector(`link[href="${MYANMAR_FONT}"]`)) return
    const l = document.createElement('link')
    l.rel = 'stylesheet'
    l.href = MYANMAR_FONT
    document.head.appendChild(l)
  }, [on])
}

/** One heading: the note's language, English small underneath */
function H({ l }: { l: { main: string; en: string } }) {
  return (
    <>
      {l.main}
      <span className="dn-en">{l.en}</span>
    </>
  )
}

function Fact({ label, children, className }: { label: { main: string; en: string }; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt>
        {label.main}
        <span className="dn-en">{label.en}</span>
      </dt>
      <dd>{children || '–'}</dd>
    </div>
  )
}

/**
 * The delivery note as paper: header facts, then one row per line with its barcodes (13-digit maker
 * codes, else Makro's own, else the 6-digit article number), ordered / delivered / short. The column
 * headings and the "whose note" line repeat on every printed page.
 */
export function DeliveryNoteSheet({ note, lang }: { note: DeliveryNote; lang: NoteLang }) {
  useMyanmarFont(lang === 'my')
  const L = NOTE_LABELS[lang]
  const shortLines = note.items.filter((i) => i.isShort).length
  const boxes = [note.boxes.paper, note.boxes.foam, note.boxes.piece].reduce((a, b) => a + b, 0)
  const dest = note.island ? (DESTINATION[lang][note.island] ?? note.island) : null

  return (
    <article className="dn-sheet" lang={lang} aria-label={`${L.title.main} ${note.orderNo}`}>
      <header className="dn-head">
        <div>
          <div className="dn-title">
            <H l={L.title} />
          </div>
          <div className="dn-shop">{lang === 'th' ? 'แม็คโคร สาขาระนอง · ' : ''}Makro Ranong — Online delivery</div>
        </div>
        <div className="dn-po">
          <span className="dn-en">
            {L.po.main} / {L.po.en}
          </span>
          <div className="dn-po-no">{note.orderNo}</div>
        </div>
      </header>

      <dl className="dn-facts">
        <Fact label={L.customer} className="dn-wide">
          <span className="dn-customer dn-th">{note.customerName}</span>
        </Fact>
        <Fact label={L.member}>{note.memberCard}</Fact>
        <Fact label={L.invoice}>{note.invoiceNo}</Fact>
        <Fact label={L.shipDate}>{noteDate(note.shipDate)}</Fact>
        <Fact label={note.boatName ? L.boat : L.destination}>
          {[dest, note.boatName].filter(Boolean).join(' · ')}
        </Fact>
        {boxes > 0 && <Fact label={L.boxes}>{boxes}</Fact>}
      </dl>

      <table className="dn-table">
        <colgroup>
          <col className="dn-col-no" style={{ width: '9mm' }} />
          <col className="dn-col-code" style={{ width: '42mm' }} />
          <col />
          <col className="dn-col-q" style={{ width: '15mm' }} />
          <col className="dn-col-q" style={{ width: '15mm' }} />
          <col className="dn-col-q" style={{ width: '15mm' }} />
        </colgroup>
        <thead>
          <tr className="dn-repeat">
            <th colSpan={6}>
              {L.title.main} · <b>{note.orderNo}</b> · <span className="dn-th">{note.customerName}</span>
            </th>
          </tr>
          <tr className="dn-cols">
            <th className="num">
              <H l={L.no} />
            </th>
            <th>
              <H l={L.code} />
            </th>
            <th>
              <H l={L.item} />
            </th>
            <th className="num">
              <H l={L.ordered} />
            </th>
            <th className="num">
              <H l={L.shipped} />
            </th>
            <th className="num">
              <H l={L.short} />
            </th>
          </tr>
        </thead>
        <tbody>
          {note.items.map((it, i) => {
            const codes = noteCodes(it.barcodes)
            const short = shortQty(it)
            return (
              <tr key={`${it.lineNo}-${it.itemId ?? it.productName}`} className={it.isShort ? 'dn-row-short' : undefined}>
                <td className="no">{i + 1}</td>
                <td>
                  {codes.map((c) => (
                    <div key={c} className="dn-code">
                      {c}
                    </div>
                  ))}
                  {it.itemId && <div className={'dn-item-id' + (codes.length ? '' : ' alone')}>{it.itemId}</div>}
                </td>
                <td className="dn-th">{it.productName}</td>
                <td className="num">{qtyText(it.ordered)}</td>
                <td className="num">{qtyText(it.shipped)}</td>
                <td className={'num dn-short' + (short > 0 ? '' : ' dn-zero')}>{short > 0 ? qtyText(short) : '–'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="dn-foot">
        <div className="dn-totals">
          <span>
            {L.totalLines.main} <span className="dn-en">{L.totalLines.en}</span>
            <b>{note.items.length}</b>
          </span>
          <span>
            {L.shortLines.main} <span className="dn-en">{L.shortLines.en}</span>
            <b>{shortLines}</b>
          </span>
        </div>
        {note.syncedAt && (
          <span style={{ textAlign: 'right' }}>
            {L.asOf.main} <span className="dn-en">{L.asOf.en}</span>
            {noteDateTime(note.syncedAt)}
          </span>
        )}
      </div>
      <p className="dn-hint">
        {L.checkHint.main}
        <span className="dn-en">{L.checkHint.en}</span>
      </p>
    </article>
  )
}

/** The language switch and print button above the sheet (never printed) */
export function NoteToolbar({
  lang,
  onLang,
  onPrint,
  back,
}: {
  lang: NoteLang
  onLang: (l: NoteLang) => void
  onPrint: () => void
  back?: ReactNode
}) {
  return (
    <div className="dn-toolbar">
      {back}
      <div role="group" aria-label="ภาษา / Language" className="inline-flex overflow-hidden rounded-lg border border-line-strong bg-surface">
        {(
          [
            ['th', 'ไทย'],
            ['my', 'မြန်မာ'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={lang === v}
            onClick={() => onLang(v)}
            className={'min-h-[2.5rem] px-4 text-sm ' + (lang === v ? 'bg-ink font-semibold text-surface' : 'text-ink-soft')}
          >
            {label}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-primary ml-auto" onClick={onPrint}>
        {lang === 'my' ? 'ပရင့်ထုတ် / Print' : 'พิมพ์ / Print'}
      </button>
    </div>
  )
}
