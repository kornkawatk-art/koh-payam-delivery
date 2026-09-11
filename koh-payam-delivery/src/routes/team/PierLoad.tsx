import { useCallback, useEffect, useState } from 'react'
import { getOrCreateShipDay, listOrdersForDay } from '../../lib/api/shipDays'
import { setOrderBoat, updateOrderStatus } from '../../lib/api/orders'
import { attachEvidencePhoto } from '../../lib/api/photos'
import PhotoCapture from '../../components/PhotoCapture'
import { PageHeader } from '../../components/ui/PageHeader'
import { todayLocalISO, formatTHB } from '../../lib/format'

type Boat = { id: string; name: string }
type PierOrder = {
  id: string
  makro_order_no: string
  customer_name_en: string
  status: string
  boat_id: string | null
  paper_box_count: number
  foam_box_count: number
  outstanding_amount: number | null
  payment_method: string | null
}

const ACTIVE = ['packed', 'at_pier']

export default function PierLoad() {
  const [date, setDate] = useState(todayLocalISO())
  const [boats, setBoats] = useState<Boat[]>([])
  const [orders, setOrders] = useState<PierOrder[]>([])
  const [sel, setSel] = useState<PierOrder | null>(null)
  const [photoCount, setPhotoCount] = useState(0)
  const [photoBusy, setPhotoBusy] = useState(false)
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
      setPhotoBusy(false)
      load()
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  if (failed)
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="alert alert-danger">โหลดข้อมูลท่าเรือไม่สำเร็จ</p>
        <button className="btn btn-secondary btn-sm" onClick={load}>
          ลองใหม่
        </button>
      </div>
    )

  if (!sel)
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title="ที่ท่าเรือ"
          actions={
            <input
              type="date"
              className="w-auto"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          }
        />
        {orders.length === 0 && (
          <p className="muted">ไม่มีออเดอร์ที่พร้อมส่งขึ้นเรือ</p>
        )}
        <div className="flex flex-col gap-2">
          {orders.map((o) => (
            <button
              key={o.id}
              className="card flex items-center justify-between gap-3 text-left hover:border-line-strong"
              onClick={() => {
                setSel(o)
                setPhotoCount(0)
                setPhotoBusy(false)
                setMsg(undefined)
              }}
            >
              <span className="font-medium">
                {o.makro_order_no} · {o.customer_name_en}
              </span>
              <span className="badge badge-neutral">
                {o.paper_box_count + o.foam_box_count} ลัง
              </span>
            </button>
          ))}
        </div>
        {msg && <p className="muted">{msg}</p>}
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <button className="btn btn-ghost btn-sm -ml-2 w-fit" onClick={() => setSel(null)}>
        ← กลับ
      </button>
      <h1 className="page-title">
        {sel.makro_order_no} · {sel.customer_name_en}
      </h1>

      {sel.outstanding_amount != null && sel.outstanding_amount > 0 && (
        <p className="alert alert-warn">
          เก็บเงินปลายทาง {formatTHB(sel.outstanding_amount)} ({sel.payment_method})
        </p>
      )}

      <section>
        <p className="section-title mb-2">เลือกเรือ</p>
        <div className="flex flex-wrap gap-2">
          {boats.map((b) => (
            <button
              key={b.id}
              onClick={() => void chooseBoat(b.id)}
              className={
                'min-h-[3.25rem] rounded-xl border px-5 text-lg font-medium transition-colors ' +
                (sel.boat_id === b.id
                  ? 'border-ink bg-ink text-white'
                  : 'border-line-strong bg-surface hover:bg-paper')
              }
            >
              {b.name}
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="section-title mb-2">รูปหลักฐาน (สูงสุด 3)</p>
        <PhotoCapture
          scope="evidence"
          orderId={sel.id}
          max={3}
          onBusyChange={setPhotoBusy}
          onUploaded={async (key) => {
            try {
              await attachEvidencePhoto(sel.id, key, { stage: 'handoff' })
              setPhotoCount((c) => c + 1)
            } catch (e) {
              setMsg((e as Error).message)
            }
          }}
        />
      </section>

      <button
        className="btn btn-primary min-h-[3.25rem] w-full text-lg"
        onClick={ship}
        disabled={!sel.boat_id || photoCount < 1 || photoBusy}
      >
        ส่งขึ้นเรือแล้ว
      </button>
      {photoBusy && (
        <p className="muted text-xs">กำลังอัปโหลดรูป กรุณารอสักครู่ก่อนส่งขึ้นเรือ</p>
      )}
      {msg && <p className="muted">{msg}</p>}
    </div>
  )
}
