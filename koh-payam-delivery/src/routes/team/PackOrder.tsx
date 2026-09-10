import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getOrder, updateOrderStatus } from '../../lib/api/orders'
import { savePack } from '../../lib/api/pack'
import {
  listPendingBackordersForOrder,
  markBackorderFulfilled,
  type BackorderRow,
} from '../../lib/api/backorders'
import { Spinner } from '../../components/ui/Spinner'
import { PageHeader } from '../../components/ui/PageHeader'

type ItemState = {
  id: string
  product_name: string
  qty_ordered: number
  qty_shipped: number
  item_remark: string | null
  status: 'ok' | 'short'
}

export default function PackOrder() {
  const { id } = useParams()
  const [order, setOrder] = useState<any>(null)
  const [items, setItems] = useState<ItemState[]>([])
  const [backorders, setBackorders] = useState<BackorderRow[]>([])
  const [paper, setPaper] = useState(0)
  const [foam, setFoam] = useState(0)
  const [msg, setMsg] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    getOrder(id!)
      .then((o: any) => {
        setOrder(o)
        setItems(o.order_items.map((it: any) => ({ ...it })))
        setPaper(o.paper_box_count)
        setFoam(o.foam_box_count)
      })
      .catch(() => setFailed(true))
    listPendingBackordersForOrder(id!)
      .then(setBackorders)
      .catch(() => setBackorders([]))
  }, [id])

  if (failed) return <p className="alert alert-danger">โหลดออเดอร์ไม่สำเร็จ</p>
  if (!order) return <Spinner />

  async function save(markPacked: boolean) {
    setBusy(true)
    setMsg(undefined)
    try {
      await savePack({ orderId: id!, paperCount: paper, foamCount: foam })
      if (markPacked) await updateOrderStatus(id!, 'packed')
      setMsg(markPacked ? 'บันทึกและทำเครื่องหมายแพ็คเสร็จแล้ว' : 'บันทึกแล้ว')
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function fulfil(bid: string) {
    try {
      await markBackorderFulfilled(bid)
      setBackorders((s) => s.filter((b) => b.id !== bid))
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`แพ็ค · ${order.makro_order_no} · ${order.customer_name_en}`} />

      {backorders.length > 0 && (
        <div className="alert alert-warn">
          <p className="font-semibold">ของค้างส่งจากออเดอร์ก่อนหน้า</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {backorders.map((b) => (
              <li key={b.id} className="flex items-center gap-3">
                <span>
                  {b.product_name} x{b.qty}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => fulfil(b.id)}
                >
                  ส่งแล้ว
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <p className="section-title">รายการสินค้า</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>สินค้า</th>
                <th>สั่ง</th>
                <th>ส่งจริง</th>
                <th>สถานะ</th>
                <th>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.product_name}</td>
                  <td className="tnum">{it.qty_ordered}</td>
                  <td className="tnum">{it.qty_shipped}</td>
                  <td>
                    {it.status === 'short' && (
                      <span className="badge badge-danger">ขาด</span>
                    )}
                  </td>
                  <td>{it.item_remark}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="card flex flex-col gap-4">
        <div className="flex flex-wrap gap-4">
          <label className="field">
            <span className="field-label">ลังกระดาษ</span>
            <input
              type="number"
              min={0}
              className="w-24"
              value={paper}
              onChange={(e) => setPaper(+e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">ลังโฟม</span>
            <input
              type="number"
              min={0}
              className="w-24"
              value={foam}
              onChange={(e) => setFoam(+e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" onClick={() => save(false)} disabled={busy}>
            บันทึก
          </button>
          <button className="btn btn-primary" onClick={() => save(true)} disabled={busy}>
            บันทึก + แพ็คเสร็จ
          </button>
        </div>
        {msg && <p className="muted">{msg}</p>}
      </div>
    </div>
  )
}
