import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from '@phosphor-icons/react'
import { defaultNoteLang, type DeliveryNote, type NoteLang } from '../../lib/deliveryNote'
import { DeliveryNoteSheet, NoteToolbar } from '../../components/DeliveryNoteSheet'

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/order-view`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const LS = 'cust_note_lang'

/**
 * The customer's delivery note, from their order link (/o/:token/note): the same sheet the team prints,
 * Thai or Myanmar. order-view returns it only once Makro has filled in what it shipped.
 */
export default function CustomerDeliveryNote() {
  const { token } = useParams()
  const [note, setNote] = useState<DeliveryNote | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'not_ready' | 'not_found' | 'error'>('loading')
  const [lang, setLang] = useState<NoteLang | null>(() => {
    try {
      const v = localStorage.getItem(LS)
      return v === 'th' || v === 'my' ? v : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    fetch(`${FN}?token=${encodeURIComponent(token ?? '')}`, { headers: { Authorization: `Bearer ${ANON}` } })
      .then(async (res) => {
        if (!res.ok) return setState(res.status === 404 ? 'not_found' : 'error')
        const j = (await res.json()) as { deliveryNote?: DeliveryNote | null }
        if (!j.deliveryNote) return setState('not_ready')
        setNote(j.deliveryNote)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [token])

  const shown: NoteLang = lang ?? defaultNoteLang(note?.island)
  function choose(l: NoteLang) {
    setLang(l)
    try {
      localStorage.setItem(LS, l)
    } catch {
      /* private mode: the choice lasts this visit */
    }
  }

  const back = (
    <Link to={`/o/${token}`} className="btn btn-ghost">
      <ArrowLeft size={18} aria-hidden="true" />
      {shown === 'my' ? 'နောက်သို့ / Back' : 'กลับ / Back'}
    </Link>
  )
  const message: Record<Exclude<typeof state, 'ready' | 'loading'>, string> = {
    not_ready: 'ใบส่งของจะพร้อมเมื่อแม็คโครจัดของเสร็จ · ပစ္စည်းပို့လွှာ မကြာမီ ရရှိနိုင်ပါမည် · The delivery note will be ready once Makro has packed the order.',
    not_found: 'ไม่พบลิงก์นี้ หรือหมดอายุแล้ว · Link not found or expired.',
    error: 'โหลดไม่สำเร็จ ลองใหม่อีกครั้ง · Could not load, please try again.',
  }

  return (
    <div className="dn-desk">
      <NoteToolbar lang={shown} onLang={choose} onPrint={() => window.print()} back={back} />
      {state === 'loading' ? (
        <p className="text-center text-sm text-ink-soft">…</p>
      ) : state === 'ready' && note ? (
        <DeliveryNoteSheet note={note} lang={shown} />
      ) : (
        <p className="card mx-auto max-w-xl text-sm text-ink-soft">{message[state as keyof typeof message]}</p>
      )}
    </div>
  )
}
