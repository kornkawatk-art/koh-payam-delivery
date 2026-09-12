import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getClaim, resolveClaim } from '../../lib/api/claims'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../../components/ui/Spinner'
import { PageHeader } from '../../components/ui/PageHeader'
import { ZoomableImage } from '../../components/ui/ZoomableImage'

const R2 = import.meta.env.VITE_R2_PUBLIC_BASE_URL as string

export default function ClaimDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [c, setC] = useState<any>(null)
  const [failed, setFailed] = useState(false)
  const [evi, setEvi] = useState<{ url: string; stage: string }[]>([])
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
          .select('r2_key, stage')
          .eq('order_id', orderId)
        if (error) throw error
        if (active)
          setEvi(
            (data ?? []).map((p: any) => ({
              url: `${R2}/${p.r2_key}`,
              stage: p.stage ?? 'handoff',
            })),
          )
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

  const claimItems = (c.claim_items ?? []) as { qty: number; order_items: { product_name: string } | null }[]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`เคลม · ${c.orders?.makro_order_no} · ${c.orders?.customer_name_en}`} />

      <div className="card flex flex-col gap-2 text-sm">
        <p>ประเภท: {c.type}</p>
        {claimItems.length > 0 && (
          <ul className="list-inside list-disc">
            {claimItems.map((ci, i) => (
              <li key={i}>
                {ci.order_items?.product_name ?? 'ไม่ระบุสินค้า'} × {ci.qty}
              </li>
            ))}
          </ul>
        )}
        {c.description && <p className="whitespace-pre-wrap text-ink-soft">{c.description}</p>}
      </div>

      <section className="flex flex-col gap-2">
        <p className="section-title">รูปจากลูกค้า</p>
        <div className="flex flex-wrap gap-2">
          {(c.claim_photos ?? []).length === 0 && <p className="muted">ไม่มีรูป</p>}
          {(c.claim_photos ?? []).map((p: any) => (
            <ZoomableImage key={p.r2_key} src={`${R2}/${p.r2_key}`} alt="รูปจากลูกค้า" />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="section-title">รูปตอนแพ็ค</p>
        <div className="flex flex-wrap gap-2">
          {evi.filter((p) => p.stage === 'pack').length === 0 && (
            <p className="muted">ไม่มีรูป</p>
          )}
          {evi
            .filter((p) => p.stage === 'pack')
            .map((p) => (
              <ZoomableImage key={p.url} src={p.url} alt="รูปหลักฐานของทีม" />
            ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="section-title">รูปตอนส่งขึ้นเรือ</p>
        <div className="flex flex-wrap gap-2">
          {evi.filter((p) => p.stage !== 'pack').length === 0 && (
            <p className="muted">ไม่มีรูป</p>
          )}
          {evi
            .filter((p) => p.stage !== 'pack')
            .map((p) => (
              <ZoomableImage key={p.url} src={p.url} alt="รูปหลักฐานของทีม" />
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
                disabled={claimItems.length === 0}
              />
              ส่งชดเชยวันถัดไป
            </label>
            {claimItems.length === 0 && (
              <p className="muted text-xs">
                เคลมนี้ไม่มีรายการสินค้า จึงส่งชดเชยไม่ได้ — เลือกคืนเงินแทน
              </p>
            )}
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
