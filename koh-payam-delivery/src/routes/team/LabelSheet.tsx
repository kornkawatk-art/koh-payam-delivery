import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getOrder } from '../../lib/api/orders'
import { Spinner } from '../../components/ui/Spinner'
import { formatDateTH } from '../../lib/format'
import './LabelSheet.css'

const seqLines = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}/${n}`)

export default function LabelSheet() {
  const { id } = useParams()
  const [order, setOrder] = useState<any>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    getOrder(id!)
      .then(setOrder)
      .catch(() => setFailed(true))
  }, [id])

  if (failed) return <p className="alert alert-danger">โหลดออเดอร์ไม่สำเร็จ</p>
  if (!order) return <Spinner />

  const paper = order.paper_box_count ?? 0
  const foam = order.foam_box_count ?? 0
  const piece = order.piece_count ?? 0

  return (
    <div className="flex flex-col gap-4">
      <button
        className="no-print btn btn-primary w-fit"
        onClick={() => window.print()}
      >
        สั่งพิมพ์
      </button>

      {order.packed_with?.makro_order_no && (
        <p className="no-print alert alert-info">
          ออเดอร์นี้แพ็ครวมกับ {order.packed_with.makro_order_no} — ลังทั้งหมดของลูกค้าอยู่ที่ใบเขียนหน้าลังของออเดอร์นั้น{' '}
          <Link className="link" to={`/order/${order.packed_with_order_id}/label`}>
            เปิดใบเขียนหน้าลัง {order.packed_with.makro_order_no}
          </Link>
        </p>
      )}

      <div className="label-sheet card">
        <p className="text-4xl font-bold uppercase tracking-tight">{order.customer_name_en}</p>
        <p className="mt-2 text-lg text-ink-soft">
          ออเดอร์ {order.makro_order_no} · ส่ง {formatDateTH(order.ship_date)}
        </p>
        <p className="text-lg text-ink-soft">คนแพ็ค: {order.packer_name || '—'}</p>

        <div className="mt-6 flex flex-col gap-5 text-xl">
          <div>
            <p className="font-semibold">เขียนหน้าลัง · ลังกระดาษ ({paper})</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {paper === 0 ? (
                <span>—</span>
              ) : (
                seqLines(paper).map((s) => (
                  <span
                    key={s}
                    className="rounded-md border border-line px-2 py-0.5 tnum"
                  >
                    {s}
                  </span>
                ))
              )}
            </div>
          </div>
          <div>
            <p className="font-semibold">เขียนหน้าลัง · ลังโฟม ({foam})</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {foam === 0 ? (
                <span>—</span>
              ) : (
                seqLines(foam).map((s) => (
                  <span
                    key={s}
                    className="rounded-md border border-line px-2 py-0.5 tnum"
                  >
                    {s}
                  </span>
                ))
              )}
            </div>
          </div>
          <div>
            <p className="font-semibold">เขียนหน้าลัง · ชิ้น ({piece})</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {piece === 0 ? (
                <span>—</span>
              ) : (
                seqLines(piece).map((s) => (
                  <span
                    key={s}
                    className="rounded-md border border-line px-2 py-0.5 tnum"
                  >
                    {s}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
