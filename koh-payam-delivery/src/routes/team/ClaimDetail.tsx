import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getClaim, resolveClaim } from '../../lib/api/claims'
import { supabase } from '../../lib/supabase'
import { PageSkeleton } from '../../components/ui/Skeleton'
import { PageHeader } from '../../components/ui/PageHeader'
import { PhotoGallery } from '../../components/ui/PhotoGallery'
import { claimTypeTH } from '../../lib/claimTypes'
import { claimStatusTH, timeLeft } from '../../lib/claimSla'
import { formatDateTimeTH, formatTHB } from '../../lib/format'
import { maxBrokenEggs } from '../../../supabase/functions/_shared/eggs'

const R2 = import.meta.env.VITE_R2_PUBLIC_BASE_URL as string
const TEAM_NOTE = '\n[ทีม] ' // resolveClaim appends team notes to the description like this

type ClaimItem = {
  qty: number
  order_items: { product_name: string; makro_item_id?: string | null; qty_shipped?: number } | null
}

/**
 * One claim, laid out in the order a manager decides it: what the customer
 * reported, the three photo sets side by side, then the decision. A decided
 * claim shows its result instead of the form.
 */
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
        if (active) setC(claim)
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
  if (!c) return <PageSkeleton />

  const n = Number(amount)
  const refund = Number.isFinite(n) && n >= 0 ? n : 0

  async function save() {
    setBusy(true)
    setErr('')
    try {
      await resolveClaim(id!, {
        decision,
        resolution: decision === 'approved' ? resolution : undefined,
        refundAmount: decision === 'approved' && resolution === 'refund' ? refund : undefined,
        note: note || undefined,
      })
      nav('/claims')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const claimItems = (c.claim_items ?? []) as ClaimItem[]
  const isEggs = c.type === 'broken_eggs'
  const status = (c.status as string | undefined) ?? 'open'
  const isOpen = status === 'open'
  const statusTH = claimStatusTH(status, c.resolution ?? null)
  const left = isOpen && c.created_at ? timeLeft(c.created_at) : null
  const [customerText, ...teamNotes] = String(c.description ?? '').split(TEAM_NOTE)
  const packPhotos = evi.filter((p) => p.stage === 'pack')
  const boatPhotos = evi.filter((p) => p.stage !== 'pack')
  const customerPhotos = (c.claim_photos ?? []) as { r2_key: string }[]

  const willSave =
    decision === 'rejected'
      ? 'ปฏิเสธ'
      : resolution === 'refund'
        ? `อนุมัติ · คืนเงิน ${formatTHB(refund)}`
        : 'อนุมัติ · ส่งชดเชยวันถัดไป'

  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ to: '/claims', label: 'คิวเคลม' }} title={c.orders?.customer_name_en ?? 'เคลม'} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="badge badge-neutral">{claimTypeTH(c.type)}</span>
        <span className={`badge ${statusTH.tone}`}>{statusTH.label}</span>
        <span className="text-ink-soft">
          PO <span className="num">{c.orders?.makro_order_no}</span>
        </span>
        {c.created_at && <span className="text-ink-soft">แจ้ง {formatDateTimeTH(c.created_at)}</span>}
        {left && (
          <span className={left.late ? 'font-semibold text-danger-ink' : 'text-ink-soft'}>
            {left.late ? `${left.label} (ควรตอบภายใน 24 ชม.)` : `${left.label} ให้ตัดสิน`}
          </span>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="card flex flex-col gap-3">
            <h2 className="section-title">ลูกค้าแจ้งว่า</h2>
            {claimItems.length > 0 ? (
              <table className="w-full text-sm">
                <tbody>
                  {claimItems.map((ci, i) => (
                    <tr key={i} className="border-b border-line last:border-b-0">
                      <td className="py-2 pr-3">
                        {ci.order_items?.product_name ?? 'ไม่ระบุสินค้า'}
                        {ci.order_items?.makro_item_id && (
                          <span className="num block text-xs text-ink-soft">{ci.order_items.makro_item_id}</span>
                        )}
                      </td>
                      <td className="num whitespace-nowrap py-2 text-right font-semibold">
                        {isEggs ? (
                          <>
                            แตก {ci.qty} ฟอง
                            {ci.order_items && ci.order_items.qty_shipped != null && (
                              <span className="block text-xs font-normal text-ink-soft">
                                จาก {maxBrokenEggs(ci.order_items.product_name, ci.order_items.qty_shipped)} ฟอง
                              </span>
                            )}
                          </>
                        ) : (
                          <>× {ci.qty}</>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">ไม่มีรายการสินค้า (แจ้งทั้งกล่อง)</p>
            )}
            {customerText.trim() && (
              <p className="whitespace-pre-wrap border-l-4 border-line-strong pl-3 text-sm">{customerText.trim()}</p>
            )}
            {teamNotes.length > 0 && (
              <section aria-label="โน้ตทีม" className="flex flex-col gap-1 rounded-lg bg-paper px-3 py-2 text-sm">
                <span className="text-xs font-medium text-ink-soft">โน้ตทีม</span>
                {teamNotes.map((t, i) => (
                  <p key={i} className="whitespace-pre-wrap">
                    {t}
                  </p>
                ))}
              </section>
            )}
          </section>

          <section className="card flex flex-col gap-3">
            <h2 className="section-title">รูปเทียบ</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <PhotoSet title="รูปจากลูกค้า" count={customerPhotos.length}>
                <PhotoGallery
                  photos={customerPhotos.map((p) => ({ src: `${R2}/${p.r2_key}`, alt: 'รูปจากลูกค้า' }))}
                />
              </PhotoSet>
              <PhotoSet title="รูปตอนแพ็ค" count={packPhotos.length}>
                <PhotoGallery photos={packPhotos.map((p) => ({ src: p.url, alt: 'รูปหลักฐานของทีม' }))} />
              </PhotoSet>
              <PhotoSet title="รูปตอนส่งขึ้นเรือ" count={boatPhotos.length}>
                <PhotoGallery photos={boatPhotos.map((p) => ({ src: p.url, alt: 'รูปหลักฐานของทีม' }))} />
              </PhotoSet>
            </div>
          </section>
        </div>

        {isOpen ? (
          <section className="card flex flex-col gap-3 lg:sticky lg:top-4">
            <h2 className="section-title">ตัดสิน</h2>
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="sr-only">ผลการพิจารณา</legend>
              <Choice
                name="decision"
                label="อนุมัติ"
                hint="ลูกค้าได้รับการชดเชย"
                checked={decision === 'approved'}
                onChange={() => setDecision('approved')}
                tone="ok"
              />
              <Choice
                name="decision"
                label="ปฏิเสธ"
                hint="ไม่ชดเชย"
                checked={decision === 'rejected'}
                onChange={() => setDecision('rejected')}
                tone="danger"
              />
            </fieldset>

            {decision === 'approved' && (
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">วิธีชดเชย</legend>
                <div className="grid grid-cols-2 gap-2">
                  <Choice
                    name="resolution"
                    label="คืนเงิน"
                    hint="ใส่ยอดที่คืน"
                    checked={resolution === 'refund'}
                    onChange={() => setResolution('refund')}
                  />
                  <Choice
                    name="resolution"
                    label="ส่งชดเชยวันถัดไป"
                    hint={isEggs ? 'ส่งเป็นฟองตามจำนวนที่แตก' : 'ส่งของแทนรอบหน้า'}
                    checked={resolution === 'resend_next_day'}
                    onChange={() => setResolution('resend_next_day')}
                    disabled={claimItems.length === 0}
                  />
                </div>
                {claimItems.length === 0 && (
                  <p className="muted text-xs">เคลมนี้ไม่มีรายการสินค้า จึงส่งชดเชยไม่ได้ — เลือกคืนเงินแทน</p>
                )}
                {resolution === 'refund' && (
                  <label className="flex items-center gap-2">
                    <span className="text-ink-soft">฿</span>
                    <input
                      aria-label="จำนวนเงินคืน"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      className="num"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                )}
              </fieldset>
            )}

            <label className="field">
              <span className="field-label">โน้ต</span>
              <textarea placeholder="โน้ต (ไม่บังคับ)" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>

            <p role="status" className="rounded-lg bg-paper px-3 py-2 text-sm">
              จะบันทึก: <strong>{willSave}</strong>
            </p>
            {err && <p className="alert alert-danger">{err}</p>}
            <button className="btn btn-primary w-full" onClick={save} disabled={busy}>
              บันทึกผล
            </button>
          </section>
        ) : (
          <section aria-label="ผลการตัดสิน" className="card flex flex-col gap-2 text-sm">
            <h2 className="section-title">ผลการตัดสิน</h2>
            <p>
              <span className={`badge ${statusTH.tone}`}>{statusTH.label}</span>
            </p>
            {c.resolution === 'refund' && (
              <p>
                คืนเงิน <strong className="num">{formatTHB(Number(c.refund_amount ?? 0))}</strong>
              </p>
            )}
            {c.resolved_at && <p className="text-ink-soft">ตัดสินเมื่อ {formatDateTimeTH(c.resolved_at)}</p>}
          </section>
        )}
      </div>
    </div>
  )
}

function PhotoSet({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm font-medium">
        <span>{title}</span> <span className="num text-xs text-ink-faint">{count}</span>
      </p>
      {count === 0 ? <p className="muted">ไม่มีรูป</p> : <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

/** A big tappable option card around a real radio (keyboard and screen readers get a radio). */
function Choice({
  name,
  label,
  hint,
  checked,
  onChange,
  disabled,
  tone,
}: {
  name: string
  label: string
  hint: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
  tone?: 'ok' | 'danger'
}) {
  const on =
    tone === 'ok' ? 'border-ok ring-1 ring-ok' : tone === 'danger' ? 'border-danger ring-1 ring-danger' : 'border-ink ring-1 ring-ink'
  return (
    <label
      className={
        'flex min-h-[3.5rem] cursor-pointer flex-col justify-center gap-0.5 rounded-lg border bg-surface px-3 py-2 focus-within:outline focus-within:outline-2 focus-within:outline-brand ' +
        (checked ? on : 'border-line-strong') +
        (disabled ? ' cursor-not-allowed opacity-50' : '')
      }
    >
      <input
        type="radio"
        name={name}
        aria-label={label}
        className="sr-only"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="font-semibold">{label}</span>
      <span className="text-xs text-ink-soft">{hint}</span>
    </label>
  )
}
