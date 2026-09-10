import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getOrder, updateOrderStatus } from '../../lib/api/orders'
import { savePack } from '../../lib/api/pack'
import {
  listPendingBackordersForOrder,
  markBackorderFulfilled,
  type BackorderRow,
} from '../../lib/api/backorders'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'

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

  if (failed) return <p className="text-sm text-red-600">โหลดออเดอร์ไม่สำเร็จ</p>
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
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">
        แพ็ค · {order.makro_order_no} · {order.customer_name_en}
      </h1>

      {backorders.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">ของค้างส่งจากออเดอร์ก่อนหน้า</p>
          <ul className="mt-1 flex flex-col gap-1">
            {backorders.map((b) => (
              <li key={b.id} className="flex items-center gap-3">
                <span>
                  {b.product_name} x{b.qty}
                </span>
                <button
                  className="rounded border border-amber-400 px-2 py-0.5"
                  onClick={() => fulfil(b.id)}
                >
                  ส่งแล้ว
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th>สินค้า</th>
            <th>สั่ง</th>
            <th>ส่งจริง</th>
            <th>สถานะ</th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-t">
              <td>{it.product_name}</td>
              <td>{it.qty_ordered}</td>
              <td>{it.qty_shipped}</td>
              <td>
                {it.status === 'short' && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">ขาด</span>
                )}
              </td>
              <td>{it.item_remark}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex gap-4 text-sm">
        <label>
          ลังกระดาษ{' '}
          <input
            type="number"
            min={0}
            className="w-16 rounded border p-1"
            value={paper}
            onChange={(e) => setPaper(+e.target.value)}
          />
        </label>
        <label>
          ลังโฟม{' '}
          <input
            type="number"
            min={0}
            className="w-16 rounded border p-1"
            value={foam}
            onChange={(e) => setFoam(+e.target.value)}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => save(false)} disabled={busy}>
          บันทึก
        </Button>
        <Button onClick={() => save(true)} disabled={busy}>
          บันทึก + แพ็คเสร็จ
        </Button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  )
}
