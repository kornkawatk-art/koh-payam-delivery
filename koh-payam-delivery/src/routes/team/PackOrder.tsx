import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getOrder, updateOrderStatus } from '../../lib/api/orders'
import { savePack, computeShortageValue } from '../../lib/api/pack'
import {
  listPendingBackordersForOrder,
  markBackorderFulfilled,
  type BackorderRow,
} from '../../lib/api/backorders'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { formatTHB } from '../../lib/format'

type ItemState = {
  id: string
  product_name: string
  qty_ordered: number
  unit_price: number
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
        setItems(o.order_items.map((it: any) => ({ ...it, status: it.status })))
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
  const shortageValue = computeShortageValue(
    items.map((i) => ({ unit_price: i.unit_price, qty_ordered: i.qty_ordered, status: i.status })),
  )

  async function save(markPacked: boolean) {
    setBusy(true)
    setMsg(undefined)
    try {
      await savePack({
        orderId: id!,
        paperCount: paper,
        foamCount: foam,
        items: items.map((i) => ({
          id: i.id,
          status: i.status,
          qtyShipped: i.status === 'short' ? 0 : i.qty_ordered,
        })),
      })
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
            <th>ราคา/หน่วย</th>
            <th>ของขาด</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={it.id} className="border-t">
              <td>{it.product_name}</td>
              <td>{it.qty_ordered}</td>
              <td>{formatTHB(it.unit_price)}</td>
              <td>
                <input
                  type="checkbox"
                  aria-label={`ของขาด ${it.product_name}`}
                  checked={it.status === 'short'}
                  onChange={(e) =>
                    setItems((s) =>
                      s.map((x, i) =>
                        i === idx ? { ...x, status: e.target.checked ? 'short' : 'ok' } : x,
                      ),
                    )
                  }
                />
              </td>
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
      <p className="text-sm text-amber-700">มูลค่าของขาด: {formatTHB(shortageValue)}</p>
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
