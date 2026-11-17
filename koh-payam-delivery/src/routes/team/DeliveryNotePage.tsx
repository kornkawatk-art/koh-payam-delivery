import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from '@phosphor-icons/react'
import { getDeliveryNote } from '../../lib/api/deliveryNote'
import { defaultNoteLang, hasShipped, type DeliveryNote, type NoteLang } from '../../lib/deliveryNote'
import { DeliveryNoteSheet, NoteToolbar } from '../../components/DeliveryNoteSheet'

/**
 * ใบส่งของ for one PO, full page and outside the app shell so it prints as plain A4. Thai or Myanmar
 * (?lang=th|my; a Myanmar PO opens in Myanmar). Before Makro has filled in what it shipped, every line
 * would print 0 delivered -- the page says so and asks again before printing.
 */
export default function DeliveryNotePage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const [note, setNote] = useState<DeliveryNote | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    getDeliveryNote(id ?? '')
      .then((n) => live && setNote(n))
      .catch((e: Error) => live && setErr(e.message))
    return () => {
      live = false
    }
  }, [id])

  const asked = params.get('lang')
  const lang: NoteLang = asked === 'my' || asked === 'th' ? asked : defaultNoteLang(note?.island)
  const ready = note ? hasShipped(note) : true

  useEffect(() => {
    if (note) document.title = `ใบส่งของ ${note.orderNo}`
  }, [note])

  function print() {
    if (!ready && !window.confirm('ยังไม่มีจำนวนส่งจากแม็คโคร ทุกรายการจะพิมพ์เป็น "ส่ง 0"\nนำเข้าไฟล์ล่าสุดก่อน หรือกดตกลงเพื่อพิมพ์ต่อ')) return
    window.print()
  }

  const back = (
    <Link to={`/order/${id}`} className="btn btn-ghost">
      <ArrowLeft size={18} aria-hidden="true" />
      กลับไปออเดอร์
    </Link>
  )

  return (
    <div className="dn-desk">
      <NoteToolbar lang={lang} onLang={(l) => setParams({ lang: l }, { replace: true })} onPrint={print} back={back} />
      {err ? (
        <p className="alert alert-danger mx-auto max-w-xl">{err}</p>
      ) : !note ? (
        <p className="mx-auto max-w-xl text-center text-sm text-ink-soft">กำลังโหลด…</p>
      ) : (
        <>
          {!ready && (
            <p className="alert alert-warn dn-no-print mx-auto mb-3 max-w-[210mm]">
              ยังไม่มีจำนวนส่งจากแม็คโคร (ทุกรายการเป็น 0) นำเข้าไฟล์ล่าสุดก่อนพิมพ์ — ลูกค้าจะยังไม่เห็นใบส่งของในลิงก์จนกว่าจะมีจำนวนส่ง
            </p>
          )}
          <DeliveryNoteSheet note={note} lang={lang} />
        </>
      )}
    </div>
  )
}
