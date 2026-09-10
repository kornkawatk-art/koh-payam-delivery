import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
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

  if (failed) return <p className="text-sm text-red-600">โหลดออเดอร์ไม่สำเร็จ</p>
  if (!order) return <Spinner />

  const paper = order.paper_box_count ?? 0
  const foam = order.foam_box_count ?? 0

  return (
    <div className="flex flex-col gap-4">
      <button
        className="no-print w-fit rounded bg-black px-3 py-2 text-white"
        onClick={() => window.print()}
      >
        สั่งพิมพ์
      </button>
      <div className="label-sheet">
        <p className="text-4xl font-bold uppercase">{order.customer_name_en}</p>
        <p className="mt-2 text-lg">
          ออเดอร์ {order.makro_order_no} · ส่ง {formatDateTH(order.ship_date)}
        </p>
        <div className="mt-6 flex flex-col gap-4 text-xl">
          <div>
            <p className="font-semibold">เขียนหน้าลัง · ลังกระดาษ ({paper})</p>
            <p>{seqLines(paper).join('   ') || '—'}</p>
          </div>
          <div>
            <p className="font-semibold">เขียนหน้าลัง · ลังโฟม ({foam})</p>
            <p>{seqLines(foam).join('   ') || '—'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
