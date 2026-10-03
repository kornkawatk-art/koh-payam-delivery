import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { MapPin, Anchor } from '@phosphor-icons/react'
import { PageHeader } from '../../components/ui/PageHeader'
import PierGroup from './PierGroup'
import { groupByPhone } from '../../lib/groupOrders'
import { Spinner } from '../../components/ui/Spinner'
import { todayLocalISO } from '../../lib/format'
import { EmptyState } from '../../components/ui/EmptyState'
import { BackLink } from '../../components/ui/BackLink'
import { Notice, flash, type Flash } from '../../components/ui/Notice'
import { AmountDue } from '../../components/ui/AmountDue'
import { StatTile } from '../../components/ui/Stat'
import {
  IslandBadge,
  IslandFilter,
  matchesIsland,
  needsIslandFilter,
  type IslandFilterValue,
} from '../../components/ui/Island'
import { isIsland } from '../../lib/islands'

type Boat = { id: string; name: string }
type PierOrder = {
  id: string
  makro_order_no: string
  customer_name_en: string
  island?: string | null
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
  const [island, setIsland] = useState<IslandFilterValue>('all')
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
  const [msg, setMsg] = useState<Flash>()

  const load = useCallback(() => {
    // A date picker being cleared/edited passes through '' -- don't query
    // (or create a ship day) for a blank date; keep what's on screen.
    if (!date) return
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
      setMsg(flash.error((e as Error).message))
    }
  }

  // One ship at a time: a second tap mid-ship would run it again and report
  // an error ("already shipped") right after the first one succeeded.
  const [shipping, setShipping] = useState(false)
  const shipInFlight = useRef(false)

  async function ship() {
    if (!sel || shipInFlight.current) return
    shipInFlight.current = true
    setShipping(true)
    setMsg(undefined)
    try {
      await setOrderPierName(sel.id, pierName)
      await updateOrderStatus(sel.id, 'shipped')
      setMsg(flash.ok('ส่งขึ้นเรือแล้ว'))
      setSel(null)
      setPhotoCount(0)
      setInitialPhotos(null)
      setPhotoBusy(false)
      load()
    } catch (e) {
      setMsg(flash.error((e as Error).message))
    } finally {
      shipInFlight.current = false
      setShipping(false)
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
    return out.filter((e) =>
      (e.kind === 'single' ? [e.order] : e.ready).some((o) => matchesIsland(o.island, island)),
    )
  }, [all, island])
  const showIslandFilter = useMemo(() => needsIslandFilter(all.map((o) => o.island)), [all])

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
        name={selGroup.name}
        boats={boats}
        onBack={() => {
          setSelGroup(null)
          load()
        }}
        onShipped={(message) => {
          setSelGroup(null)
          setMsg(flash.ok(message))
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
        {showIslandFilter && <IslandFilter value={island} onChange={setIsland} />}
        {entries.length === 0 && (
          <EmptyState
            icon={Anchor}
            title="ไม่มีออเดอร์ที่พร้อมส่งขึ้นเรือ"
            hint="ออเดอร์จะขึ้นที่นี่หลังจากแพ็คเสร็จแล้ว"
          />
        )}
        <div className="flex flex-col gap-2">
          {entries.map((e) =>
            e.kind === 'group' ? (
              <button
                key={`g-${e.phone}`}
                className="card card-interactive flex items-center justify-between gap-3 text-left"
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
                  {showIslandFilter &&
                    Array.from(new Set(e.ready.map((o) => o.island ?? 'none'))).map((i) => (
                      <IslandBadge key={i} island={i} />
                    ))}
                  <span className="badge badge-brand">{e.ready.length} PO</span>
                  <span className="badge badge-neutral">
                    {e.ready.reduce((n, o) => n + o.paper_box_count + o.foam_box_count + o.piece_count, 0)} รวม
                  </span>
                </span>
              </button>
            ) : (
              <button
                key={e.order.id}
                className="card card-interactive flex items-center justify-between gap-3 text-left"
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
                <span className="flex items-center gap-2">
                  {showIslandFilter && <IslandBadge island={e.order.island} />}
                  <span className="badge badge-neutral">
                    {e.order.paper_box_count + e.order.foam_box_count + e.order.piece_count} รวม
                  </span>
                </span>
              </button>
            ),
          )}
        </div>
        <Notice flash={msg} />
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <BackLink onClick={() => setSel(null)} label="กลับ" />
      <h1 className="page-title">
        {sel.makro_order_no} · {sel.customer_name_en}
      </h1>
      <IslandBadge island={sel.island} className="self-start" />

      {sel.outstanding_amount != null && sel.outstanding_amount > 0 && (
        <AmountDue
          label="เก็บเงินปลายทาง"
          amount={sel.outstanding_amount}
          note={sel.payment_method}
        />
      )}

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="จำนวนลังที่ต้องลงเรือ">
        <StatTile label="ลังกระดาษ" value={sel.paper_box_count} />
        <StatTile label="ลังโฟม" value={sel.foam_box_count} />
        <StatTile label="ชิ้น" value={sel.piece_count} />
        <StatTile
          label="รวม"
          value={sel.paper_box_count + sel.foam_box_count + sel.piece_count}
          emphasis
        />
      </dl>

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
        <span className="field-label field-label-required">ชื่อคนลงเรือ</span>
        <input
          required
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
              setMsg(flash.error((e as Error).message))
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
        disabled={
          !sel.boat_id ||
          photoCount < 1 ||
          photoBusy ||
          !pierName.trim() ||
          shipping ||
          !isIsland(sel.island)
        }
      >
        ส่งขึ้นเรือแล้ว
      </button>
      {!isIsland(sel.island) && <p className="text-xs text-warn-ink">ยังไม่ระบุเกาะ — ให้หัวหน้าเลือกเกาะในหน้ารายละเอียดออเดอร์ก่อน จึงจะส่งขึ้นเรือได้</p>}
      {!pierName.trim() && (
        <p className="muted text-xs">ต้องกรอกชื่อคนลงเรือก่อนกดส่งขึ้นเรือแล้ว</p>
      )}
      {photoBusy && (
        <p className="muted text-xs">กำลังอัปโหลดรูป กรุณารอสักครู่ก่อนส่งขึ้นเรือ</p>
      )}
      <Notice flash={msg} />
    </div>
  )
}
