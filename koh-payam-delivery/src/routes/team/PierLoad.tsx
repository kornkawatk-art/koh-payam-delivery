import { useCallback, useEffect, useMemo, useState } from 'react'
import { getOrCreateShipDay, listOrdersForDay } from '../../lib/api/shipDays'
import {
  setOrderBoat,
  setOrderPierName,
  updateOrderStatus,
  listDistinctPierNames,
} from '../../lib/api/orders'
import {
  attachEvidencePhoto,
  removeEvidencePhoto,
  listEvidencePhotos,
  type ExistingPhoto,
} from '../../lib/api/photos'
import PhotoCapture from '../../components/PhotoCapture'
import { MapPin } from '@phosphor-icons/react'
import { PageHeader } from '../../components/ui/PageHeader'
import PierGroup from './PierGroup'
import { groupByPhone } from '../../lib/groupOrders'
import { Spinner } from '../../components/ui/Spinner'
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
  piece_count: number
  outstanding_amount: number | null
  payment_method: string | null
  packer_name: string | null
  pier_name: string | null
  customer_phone?: string | null
  packed_with?: { makro_order_no: string } | null
}

const ACTIVE = ['packed', 'at_pier']

// One pier-list row: a single PO, or a customer's ready POs shipped together.
type PierEntry =
  | { kind: 'single'; order: PierOrder; waiting: number }
  | { kind: 'group'; phone: string; name: string; ready: PierOrder[]; waiting: number }

export default function PierLoad() {
  const [date, setDate] = useState(todayLocalISO())
  const [boats, setBoats] = useState<Boat[]>([])
  const [all, setAll] = useState<PierOrder[]>([])
  const [selGroup, setSelGroup] = useState<{ phone: string; name: string } | null>(null)
  const [sel, setSel] = useState<PierOrder | null>(null)
  const [photoCount, setPhotoCount] = useState(0)
  // Photos already attached to `sel` from an earlier visit (e.g. the app was
  // closed mid-handoff before "ส่งขึ้นเรือแล้ว" was pressed). Fetched once
  // per selection and null while that fetch is in flight, so PhotoCapture
  // doesn't mount (and lazily seed its thumbnails) before this arrives —
  // PhotoCapture only seeds once, at its own mount.
  const [initialPhotos, setInitialPhotos] = useState<ExistingPhoto[] | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [pierName, setPierName] = useState('')
  const [pierNames, setPierNames] = useState<string[]>([])
  const [failed, setFailed] = useState(false)
  const [msg, setMsg] = useState<string>()

  const load = useCallback(() => {
    setFailed(false)
    Promise.all([getOrCreateShipDay(date), listOrdersForDay(date)])
      .then(([day, list]) => {
        setBoats(day.boats)
        setAll(list as PierOrder[])
      })
      .catch(() => setFailed(true))
  }, [date])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    listDistinctPierNames()
      .then(setPierNames)
      .catch(() => setPierNames([]))
  }, [])

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
      await setOrderPierName(sel.id, pierName)
      await updateOrderStatus(sel.id, 'shipped')
      setMsg('ส่งขึ้นเรือแล้ว')
      setSel(null)
      setPhotoCount(0)
      setInitialPhotos(null)
      setPhotoBusy(false)
      load()
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  // Customers with several POs on this date collapse into one row when 2+ of
  // them are ready; POs still waiting to be packed are counted, not listed.
  const entries = useMemo<PierEntry[]>(() => {
    const out: PierEntry[] = []
    for (const e of groupByPhone(all)) {
      if (e.kind === 'single') {
        if (ACTIVE.includes(e.order.status)) out.push({ kind: 'single', order: e.order, waiting: 0 })
        continue
      }
      const ready = e.orders.filter((o) => ACTIVE.includes(o.status))
      const waiting = e.orders.filter((o) => o.status === 'imported').length
      if (ready.length === 0) continue
      if (ready.length === 1) out.push({ kind: 'single', order: ready[0], waiting })
      else out.push({ kind: 'group', phone: e.phone, name: e.name, ready, waiting })
    }
    return out
  }, [all])

  if (failed)
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="alert alert-danger">โหลดข้อมูลท่าเรือไม่สำเร็จ</p>
        <button className="btn btn-secondary btn-sm" onClick={load}>
          ลองใหม่
        </button>
      </div>
    )

  if (selGroup)
    return (
      <PierGroup
        date={date}
        phone={selGroup.phone}
        boats={boats}
        onBack={() => {
          setSelGroup(null)
          load()
        }}
        onShipped={(message) => {
          setSelGroup(null)
          setMsg(message)
          load()
        }}
      />
    )

  if (!sel)
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title="ที่ท่าเรือ"
          icon={MapPin}
          accent="teal"
          actions={
            <input
              type="date"
              className="w-auto"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          }
        />
        {entries.length === 0 && (
          <p className="muted">ไม่มีออเดอร์ที่พร้อมส่งขึ้นเรือ</p>
        )}
        <div className="flex flex-col gap-2">
          {entries.map((e) =>
            e.kind === 'group' ? (
              <button
                key={`g-${e.phone}`}
                className="card flex items-center justify-between gap-3 text-left hover:border-line-strong"
                onClick={() => {
                  setMsg(undefined)
                  setSelGroup({ phone: e.phone, name: e.name })
                }}
              >
                <span className="flex flex-col items-start">
                  <span className="font-medium">{e.name}</span>
                  <span className="muted text-xs">{e.ready.map((o) => o.makro_order_no).join(', ')}</span>
                  {e.waiting > 0 && (
                    <span className="text-xs text-warn-ink">อีก {e.waiting} ออเดอร์ยังรอแพ็ค</span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span className="badge badge-brand">{e.ready.length} PO</span>
                  <span className="badge badge-neutral">
                    {e.ready.reduce((n, o) => n + o.paper_box_count + o.foam_box_count + o.piece_count, 0)} รวม
                  </span>
                </span>
              </button>
            ) : (
              <button
                key={e.order.id}
                className="card flex items-center justify-between gap-3 text-left hover:border-line-strong"
                onClick={() => {
                  const o = e.order
                  setSel(o)
                  setPhotoCount(0)
                  setInitialPhotos(null)
                  setPhotoBusy(false)
                  setPierName(o.pier_name ?? '')
                  setMsg(undefined)
                  listEvidencePhotos(o.id, 'handoff')
                    .then((photos) => {
                      setInitialPhotos(photos)
                      setPhotoCount(photos.length)
                    })
                    .catch(() => setInitialPhotos([])) // fail open: an unrecoverable
                    // fetch just means no photos are pre-shown -- the team member
                    // can still attach fresh ones and the ship gate still works.
                }}
              >
                <span className="flex flex-col items-start">
                  <span className="font-medium">
                    {e.order.makro_order_no} · {e.order.customer_name_en}
                  </span>
                  {e.order.packer_name && (
                    <span className="muted text-xs">คนแพ็ค: {e.order.packer_name}</span>
                  )}
                  {e.order.packed_with?.makro_order_no && (
                    <span className="muted text-xs">
                      แพ็ครวมกับ {e.order.packed_with.makro_order_no}
                    </span>
                  )}
                  {e.waiting > 0 && (
                    <span className="text-xs text-warn-ink">
                      อีก {e.waiting} ออเดอร์ของลูกค้านี้ยังรอแพ็ค
                    </span>
                  )}
                </span>
                <span className="badge badge-neutral">
                  {e.order.paper_box_count + e.order.foam_box_count + e.order.piece_count} รวม
                </span>
              </button>
            ),
          )}
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
        <p className="alert alert-danger">
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

      <label className="field">
        <span className="field-label">ชื่อคนลงเรือ</span>
        <input
          list="pier-name-options"
          className="w-56"
          value={pierName}
          onChange={(e) => setPierName(e.target.value)}
        />
        <datalist id="pier-name-options">
          {pierNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </label>

      <section>
        <p className="section-title mb-2">รูปหลักฐาน (สูงสุด 5)</p>
        {initialPhotos === null ? (
          <Spinner />
        ) : (
        <PhotoCapture
          scope="evidence"
          orderId={sel.id}
          max={5}
          initialPhotos={initialPhotos}
          onBusyChange={setPhotoBusy}
          onUploaded={async (key) => {
            try {
              await attachEvidencePhoto(sel.id, key, { stage: 'handoff' })
              setPhotoCount((c) => c + 1)
            } catch (e) {
              setMsg((e as Error).message)
            }
          }}
          onRemoved={async (key) => {
            await removeEvidencePhoto(sel.id, key)
            setPhotoCount((c) => Math.max(0, c - 1))
          }}
        />
        )}
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
