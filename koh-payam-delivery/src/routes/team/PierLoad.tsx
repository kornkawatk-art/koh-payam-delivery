import { useCallback, useEffect, useState } from 'react'
import { getOrCreateShipDay, listOrdersForDay } from '../../lib/api/shipDays'
import { setOrderBoat, updateOrderStatus } from '../../lib/api/orders'
import { attachEvidencePhoto } from '../../lib/api/photos'
import PhotoCapture from '../../components/PhotoCapture'
import { Button } from '../../components/ui/Button'
import { todayLocalISO } from '../../lib/format'

type Boat = { id: string; name: string }
type PierOrder = {
  id: string
  makro_order_no: string
  customer_name_en: string
  status: string
  boat_id: string | null
  paper_box_count: number
  foam_box_count: number
}

const ACTIVE = ['packed', 'at_pier']

export default function PierLoad() {
  const [date] = useState(todayLocalISO())
  const [boats, setBoats] = useState<Boat[]>([])
  const [orders, setOrders] = useState<PierOrder[]>([])
  const [sel, setSel] = useState<PierOrder | null>(null)
  const [photoCount, setPhotoCount] = useState(0)
  const [failed, setFailed] = useState(false)
  const [msg, setMsg] = useState<string>()

  const load = useCallback(() => {
    setFailed(false)
    Promise.all([getOrCreateShipDay(date), listOrdersForDay(date)])
      .then(([day, all]) => {
        setBoats(day.boats)
        setOrders((all as PierOrder[]).filter((o) => ACTIVE.includes(o.status)))
      })
      .catch(() => setFailed(true))
  }, [date])

  useEffect(() => {
    load()
  }, [load])

  async function chooseBoat(boatId: string) {
    if (!sel) return
    setMsg(undefined)
    try {
      await setOrderBoat(sel.id, boatId)
      setSel({ ...sel, boat_id: boatId, status: 'at_pier' })
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  async function ship() {
    if (!sel) return
    setMsg(undefined)
    try {
      await updateOrderStatus(sel.id, 'shipped')
      setMsg('ส่งขึ้นเรือแล้ว')
      setSel(null)
      setPhotoCount(0)
      load()
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  if (failed)
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-red-600">โหลดข้อมูลท่าเรือไม่สำเร็จ</p>
        <button className="rounded border px-3 py-1 text-sm" onClick={load}>
          ลองใหม่
        </button>
      </div>
    )

  if (!sel)
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">ที่ท่าเรือ</h1>
        {orders.length === 0 && <p className="text-sm text-gray-500">ไม่มีออเดอร์ที่พร้อมส่งขึ้นเรือ</p>}
        {orders.map((o) => (
          <button
            key={o.id}
            className="rounded border p-3 text-left"
            onClick={() => {
              setSel(o)
              setPhotoCount(0)
              setMsg(undefined)
            }}
          >
            {o.makro_order_no} · {o.customer_name_en} · {o.paper_box_count + o.foam_box_count} ลัง
          </button>
        ))}
        {msg && <p className="text-sm">{msg}</p>}
      </div>
    )

  return (
    <div className="flex flex-col gap-3">
      <button className="text-sm underline" onClick={() => setSel(null)}>
        ← กลับ
      </button>
      <h1 className="text-lg font-semibold">
        {sel.makro_order_no} · {sel.customer_name_en}
      </h1>

      <div>
        <p className="mb-1 text-sm font-medium">เลือกเรือ</p>
        <div className="flex flex-wrap gap-2">
          {boats.map((b) => (
            <button
              key={b.id}
              onClick={() => void chooseBoat(b.id)}
              className={
                'rounded-lg border px-4 py-3 text-lg ' +
                (sel.boat_id === b.id ? 'bg-black text-white' : '')
              }
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">รูปหลักฐาน (สูงสุด 3)</p>
        <PhotoCapture
          scope="evidence"
          orderId={sel.id}
          max={3}
          onUploaded={async (key) => {
            try {
              await attachEvidencePhoto(sel.id, key)
              setPhotoCount((c) => c + 1)
            } catch (e) {
              setMsg((e as Error).message)
            }
          }}
        />
      </div>

      <Button onClick={ship} disabled={!sel.boat_id || photoCount < 1} className="py-4 text-lg">
        ส่งขึ้นเรือแล้ว
      </Button>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  )
}
