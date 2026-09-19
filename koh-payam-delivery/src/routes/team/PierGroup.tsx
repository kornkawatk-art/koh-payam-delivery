import { useEffect, useMemo, useState } from 'react'
import {
  listOrdersForCustomerDay,
  setOrderBoats,
  setOrderPierName,
  updateOrderStatus,
  listDistinctPierNames,
} from '../../lib/api/orders'
import { attachEvidencePhoto, removeEvidencePhoto } from '../../lib/api/photos'
import PhotoCapture from '../../components/PhotoCapture'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Spinner } from '../../components/ui/Spinner'
import { formatTHB } from '../../lib/format'

const R2 = import.meta.env.VITE_R2_PUBLIC_BASE_URL as string
const READY = ['packed', 'at_pier']

type Boat = { id: string; name: string }

// Ship every ready PO of one customer (same ship date + phone) together: one
// boat choice, one photo set (attached to each PO's own evidence rows so the
// customer sees it on every order link), one "ส่งขึ้นเรือแล้ว".
export default function PierGroup({
  date,
  phone,
  boats,
  onBack,
  onShipped,
}: {
  date: string
  phone: string
  boats: Boat[]
  onBack: () => void
  onShipped: (message: string) => void
}) {
  const [orders, setOrders] = useState<any[] | null>(null)
  const [failed, setFailed] = useState(false)
  // handoff photo keys already recorded on each PO
  const [photoKeys, setPhotoKeys] = useState<Record<string, string[]>>({})
  const [photoBusy, setPhotoBusy] = useState(false)
  // per-PO evidence inserts still in flight (PhotoCapture does not await onUploaded)
  const [attaching, setAttaching] = useState(0)
  const [pierName, setPierName] = useState('')
  const [pierNames, setPierNames] = useState<string[]>([])
  const [msg, setMsg] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listOrdersForCustomerDay(date, phone)
      .then((os) => {
        setOrders(os)
        setPhotoKeys(
          Object.fromEntries(
            os.map((o) => [
              o.id as string,
              (o.evidence_photos ?? [])
                .filter((p: any) => p.stage !== 'pack')
                .map((p: any) => p.r2_key as string),
            ]),
          ),
        )
        setPierName(os.find((o) => READY.includes(o.status) && o.pier_name)?.pier_name ?? '')
      })
      .catch(() => setFailed(true))
    listDistinctPierNames()
      .then(setPierNames)
      .catch(() => setPierNames([]))
  }, [date, phone])

  const ready = useMemo(() => (orders ?? []).filter((o) => READY.includes(o.status)), [orders])
  const waiting = useMemo(() => (orders ?? []).filter((o) => o.status === 'imported'), [orders])
  const readyIds = ready.map((o) => o.id as string)

  const allKeys = useMemo(() => {
    const seen = new Set<string>()
    for (const o of ready) for (const k of photoKeys[o.id] ?? []) seen.add(k)
    return Array.from(seen)
  }, [ready, photoKeys])

  if (failed) return <p className="alert alert-danger">โหลดออเดอร์ไม่สำเร็จ</p>
  if (!orders) return <Spinner />

  const customerName = orders[0]?.customer_name_en as string
  // The boat every ready PO is currently on, or null while they differ / are unset.
  const boatId: string | null =
    ready.length > 0 && ready.every((o) => o.boat_id && o.boat_id === ready[0].boat_id)
      ? ready[0].boat_id
      : null
  const outstanding = ready.reduce((n, o) => n + (o.outstanding_amount > 0 ? o.outstanding_amount : 0), 0)
  const canShip =
    ready.length > 0 && !!boatId && allKeys.length >= 1 && !photoBusy && attaching === 0 && !busy

  async function chooseBoat(id: string) {
    setMsg(undefined)
    try {
      const n = await setOrderBoats(readyIds, id)
      if (n < readyIds.length) {
        // Some POs were shipped/changed elsewhere: re-read the truth instead of
        // marking every local PO as on this boat.
        setMsg(`เลือกเรือให้ได้ ${n} จาก ${readyIds.length} ออเดอร์ (บางออเดอร์ถูกส่งไปแล้ว)`)
        setOrders(await listOrdersForCustomerDay(date, phone))
        return
      }
      setOrders((os) =>
        (os ?? []).map((o) => (READY.includes(o.status) ? { ...o, boat_id: id, status: 'at_pier' } : o)),
      )
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  function recordKey(orderId: string, key: string) {
    setPhotoKeys((k) => ({ ...k, [orderId]: [...(k[orderId] ?? []).filter((x) => x !== key), key] }))
  }

  async function addPhoto(key: string) {
    setAttaching((n) => n + 1)
    try {
      const failedNos: string[] = []
      for (const o of ready) {
        try {
          await attachEvidencePhoto(o.id, key, { stage: 'handoff' })
          recordKey(o.id, key)
        } catch {
          failedNos.push(o.makro_order_no)
        }
      }
      if (failedNos.length === ready.length) setMsg('แนบรูปไม่สำเร็จ กรุณาลบรูปนี้แล้วถ่ายใหม่')
      else if (failedNos.length > 0)
        setMsg(`แนบรูปให้ ${failedNos.join(', ')} ไม่สำเร็จ — ระบบจะลองแนบซ้ำตอนกดส่งขึ้นเรือ`)
    } finally {
      setAttaching((n) => n - 1)
    }
  }

  // Forget the key only on the POs where the delete actually succeeded, so the
  // local state never claims a photo is gone while the database still has it.
  async function dropPhoto(key: string) {
    let firstError: Error | null = null
    for (const o of ready) {
      try {
        await removeEvidencePhoto(o.id, key)
        setPhotoKeys((k) => ({ ...k, [o.id]: (k[o.id] ?? []).filter((x) => x !== key) }))
      } catch (e) {
        firstError = firstError ?? (e as Error)
      }
    }
    if (firstError) throw firstError
  }

  async function ship() {
    setBusy(true)
    setMsg(undefined)
    const done: string[] = []
    try {
      // Top up any PO that is missing one of the group's photos (e.g. an
      // attach that failed earlier), so every order link shows the full set.
      for (const o of ready)
        for (const key of allKeys)
          if (!(photoKeys[o.id] ?? []).includes(key)) {
            await attachEvidencePhoto(o.id, key, { stage: 'handoff' })
            recordKey(o.id, key) // so a retry after a later failure never inserts it twice
          }
      for (const o of ready) {
        await setOrderPierName(o.id, pierName)
        await updateOrderStatus(o.id, 'shipped')
        done.push(o.id)
      }
      onShipped(`ส่งขึ้นเรือแล้ว ${done.length} ออเดอร์ของ ${customerName}`)
    } catch (e) {
      setMsg(
        `ส่งขึ้นเรือแล้ว ${done.length} ออเดอร์ (เหลืออีก ${ready.length - done.length}) แล้วเกิดข้อผิดพลาด: ${(e as Error).message} — กดส่งขึ้นเรือแล้วอีกครั้งเพื่อทำต่อ`,
      )
      setOrders((os) => (os ?? []).map((o) => (done.includes(o.id) ? { ...o, status: 'shipped' } : o)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button className="btn btn-ghost btn-sm -ml-2 w-fit" onClick={onBack}>
        ← กลับ
      </button>
      <h1 className="page-title">
        {customerName} · {ready.length} ออเดอร์
      </h1>

      {waiting.length > 0 && (
        <p className="alert alert-warn">
          ⚠️ อีก {waiting.length} ออเดอร์ของลูกค้ารายนี้ยังรอแพ็ค ({waiting.map((o) => o.makro_order_no).join(', ')}) — จะไม่ถูกส่งในรอบนี้
        </p>
      )}

      {outstanding > 0 && (
        <p className="alert alert-danger">เก็บเงินปลายทางรวม {formatTHB(outstanding)}</p>
      )}

      {ready.length === 0 ? (
        <p className="muted">ไม่มีออเดอร์ของลูกค้ารายนี้ที่พร้อมส่งขึ้นเรือ</p>
      ) : (
        <>
          <ul className="card flex flex-col gap-1.5 text-sm">
            {ready.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{o.makro_order_no}</span>
                <span className="muted text-xs">
                  {o.paper_box_count + o.foam_box_count + o.piece_count} รวม
                  {o.packed_with_order_id &&
                    orders.find((x) => x.id === o.packed_with_order_id) &&
                    ` · แพ็ครวมกับ ${orders.find((x) => x.id === o.packed_with_order_id).makro_order_no}`}
                </span>
                <StatusBadge status={o.status} />
              </li>
            ))}
          </ul>

          <section>
            <p className="section-title mb-2">เลือกเรือ (ทุกออเดอร์ไปเรือลำเดียวกัน)</p>
            <div className="flex flex-wrap gap-2">
              {boats.map((b) => (
                <button
                  key={b.id}
                  onClick={() => void chooseBoat(b.id)}
                  className={
                    'min-h-[3.25rem] rounded-xl border px-5 text-lg font-medium transition-colors ' +
                    (boatId === b.id
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
            <p className="section-title mb-2">รูปหลักฐาน (สูงสุด 5 — แนบให้ทุกออเดอร์ในกลุ่ม)</p>
            <PhotoCapture
              scope="evidence"
              orderId={ready[0].id}
              max={5}
              initialPhotos={allKeys.map((key) => ({ key, url: `${R2}/${key}` }))}
              onBusyChange={setPhotoBusy}
              onUploaded={addPhoto}
              onRemoved={dropPhoto}
            />
          </section>

          <button
            className="btn btn-primary min-h-[3.25rem] w-full text-lg"
            onClick={ship}
            disabled={!canShip}
          >
            ส่งขึ้นเรือแล้ว ({ready.length} ออเดอร์)
          </button>
          {(photoBusy || attaching > 0) && (
            <p className="muted text-xs">กำลังอัปโหลดรูป กรุณารอสักครู่ก่อนส่งขึ้นเรือ</p>
          )}
        </>
      )}
      {msg && <p className="muted">{msg}</p>}
    </div>
  )
}
