import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getClaim, resolveClaim } from '../../lib/api/claims'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../../components/ui/Spinner'
import { PageHeader } from '../../components/ui/PageHeader'

const R2 = import.meta.env.VITE_R2_PUBLIC_BASE_URL as string

export default function ClaimDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [c, setC] = useState<any>(null)
  const [failed, setFailed] = useState(false)
  const [evi, setEvi] = useState<string[]>([])
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved')
  const [resolution, setResolution] = useState<'refund' | 'resend_next_day'>('refund')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let active = true
    getClaim(id!)
      .then((claim) => {
        if (!active) return
        setC(claim)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [id])

  // Team evidence photos load independently: a failure here must never blank
  // the already-loaded claim, so it stays out of the `failed` state.
  const orderId = c?.order_id
  useEffect(() => {
    if (!orderId) return
    let active = true
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('evidence_photos')
          .select('r2_key')
          .eq('order_id', orderId)
        if (error) throw error
        if (active) setEvi((data ?? []).map((p: any) => `${R2}/${p.r2_key}`))
      } catch (e) {
        console.warn('โหลดรูปหลักฐานของทีมไม่สำเร็จ', e)
      }
    })()
    return () => {
      active = false
    }
  }, [orderId])

  if (failed) return <p className="alert alert-danger">โหลดเคลมไม่สำเร็จ</p>
  if (!c) return <Spinner />

  async function save() {
    setBusy(true)
    setErr('')
    const n = Number(amount)
    try {
      await resolveClaim(id!, {
        decision,
        resolution: decision === 'approved' ? resolution : undefined,
        refundAmount:
          decision === 'approved' && resolution === 'refund'
            ? Number.isFinite(n) && n >= 0
              ? n
              : 0
            : undefined,
        note: note || undefined,
      })
      nav('/claims')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const item = c.order_items

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`เคลม · ${c.orders?.makro_order_no} · ${c.orders?.customer_name_en}`} />

      <div className="card flex flex-col gap-2 text-sm">
        <p>
          ประเภท: {c.type} · จำนวน: {c.qty}
        </p>
        {item && <p>รายการ: {item.product_name}</p>}
        {c.description && <p className="whitespace-pre-wrap text-ink-soft">{c.description}</p>}
      </div>

      <section className="flex flex-col gap-2">
        <p className="section-title">รูปจากลูกค้า</p>
        <div className="flex flex-wrap gap-2">
          {(c.claim_photos ?? []).length === 0 && <p className="muted">ไม่มีรูป</p>}
          {(c.claim_photos ?? []).map((p: any) => (
            <img
              key={p.r2_key}
              src={`${R2}/${p.r2_key}`}
              alt="รูปจากลูกค้า"
              className="h-24 w-24 rounded-lg border border-line object-cover"
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="section-title">รูปหลักฐานของทีม</p>
        <div className="flex flex-wrap gap-2">
          {evi.length === 0 && <p className="muted">ไม่มีรูป</p>}
          {evi.map((u) => (
            <img
              key={u}
              src={u}
              alt="รูปหลักฐานของทีม"
              className="h-24 w-24 rounded-lg border border-line object-cover"
            />
          ))}
        </div>
      </section>

      <fieldset className="card flex flex-col gap-3 text-sm">
        <legend className="section-title px-1">ผลการพิจารณา</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={decision === 'approved'}
              onChange={() => setDecision('approved')}
            />
            อนุมัติ
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={decision === 'rejected'}
              onChange={() => setDecision('rejected')}
            />
            ปฏิเสธ
          </label>
        </div>

        {decision === 'approved' && (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={resolution === 'refund'}
                onChange={() => setResolution('refund')}
              />
              คืนเงิน
            </label>
            {resolution === 'refund' && (
              <input
                aria-label="จำนวนเงินคืน"
                type="number"
                min="0"
                step="0.01"
                className="w-40"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={resolution === 'resend_next_day'}
                onChange={() => setResolution('resend_next_day')}
              />
              ส่งชดเชยวันถัดไป
            </label>
          </div>
        )}
      </fieldset>

      <label className="field">
        <span className="field-label">โน้ต</span>
        <textarea
          placeholder="โน้ต (ไม่บังคับ)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      {err && <p className="alert alert-danger">{err}</p>}
      <button className="btn btn-primary w-full sm:w-auto" onClick={save} disabled={busy}>
        บันทึกผล
      </button>
    </div>
  )
}
