import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { listOrdersForCustomerDay, updateOrderStatus } from '../../lib/api/orders'
import { savePackGroup, listDistinctPackerNames } from '../../lib/api/pack'
import { attachEvidencePhoto, removeEvidencePhoto } from '../../lib/api/photos'
import {
  listPendingBackordersForOrder,
  markBackorderFulfilled,
  type BackorderRow,
} from '../../lib/api/backorders'
import PhotoCapture from '../../components/PhotoCapture'
import { Spinner } from '../../components/ui/Spinner'
import { PageHeader } from '../../components/ui/PageHeader'
import { splitFreshDry } from '../../lib/freshDry'
import { pickPrimary } from '../../lib/groupOrders'
import { PackItemRow, type ItemState } from './PackOrder'

const R2 = import.meta.env.VITE_R2_PUBLIC_BASE_URL as string

type GroupItem = ItemState & { orderId: string; orderNo: string; editable: boolean }
type TaggedBackorder = BackorderRow & { orderNo: string }

// Combined pack page for every PO one customer (same phone) has on one ship
// date. Boxes/pieces/packer/photos are recorded once, on the primary PO (the
// first not-yet-packed one); the pack action only touches POs still 'imported'.
export default function PackGroup() {
  const { date, phone } = useParams()
  const [orders, setOrders] = useState<any[] | null>(null)
  const [packedIds, setPackedIds] = useState<Set<string>>(new Set())
  const [backorders, setBackorders] = useState<TaggedBackorder[]>([])
  const [paper, setPaper] = useState(0)
  const [foam, setFoam] = useState(0)
  const [piece, setPiece] = useState(0)
  const [packerName, setPackerName] = useState('')
  const [packerNames, setPackerNames] = useState<string[]>([])
  const [packPhotoCount, setPackPhotoCount] = useState(0)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [msg, setMsg] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    listOrdersForCustomerDay(date!, phone!)
      .then((os) => {
        setOrders(os)
        setPackedIds(
          new Set(
            os.flatMap((o) =>
              (o.order_items ?? []).filter((i: any) => i.packed).map((i: any) => i.id as string),
            ),
          ),
        )
        const primary = pickPrimary(os.filter((o) => o.status === 'imported'))
        if (primary) {
          setPaper(primary.paper_box_count)
          setFoam(primary.foam_box_count)
          setPiece(primary.piece_count)
          setPackerName(primary.packer_name ?? '')
          setPackPhotoCount(
            (primary.evidence_photos ?? []).filter((p: any) => p.stage === 'pack').length,
          )
        }
        Promise.all(
          os.map((o) =>
            listPendingBackordersForOrder(o.id)
              .then((bs) => bs.map((b) => ({ ...b, orderNo: o.makro_order_no as string })))
              .catch(() => [] as TaggedBackorder[]),
          ),
        ).then((all) => setBackorders(all.flat()))
      })
      .catch(() => setFailed(true))
    listDistinctPackerNames()
      .then(setPackerNames)
      .catch(() => setPackerNames([]))
  }, [date, phone])

  const packable = useMemo(() => (orders ?? []).filter((o) => o.status === 'imported'), [orders])
  const primary = useMemo(() => pickPrimary(packable), [packable])
  const others = useMemo(() => packable.filter((o) => o.id !== primary?.id), [packable, primary])
  // Other not-yet-packed POs that already carry their own recorded boxes: a
  // group save resets them to 0 (their boxes count toward the primary's).
  const willReset = others.filter(
    (o) => (o.paper_box_count ?? 0) + (o.foam_box_count ?? 0) + (o.piece_count ?? 0) > 0,
  )

  const items: GroupItem[] = useMemo(
    () =>
      (orders ?? []).flatMap((o) =>
        (o.order_items ?? []).map((it: any) => ({
          ...it,
          orderId: o.id,
          orderNo: o.makro_order_no,
          editable: o.status === 'imported',
        })),
      ),
    [orders],
  )
  const editableItems = items.filter((i) => i.editable)

  if (failed) return <p className="alert alert-danger">โหลดออเดอร์ไม่สำเร็จ</p>
  if (!orders) return <Spinner />
  if (orders.length === 0)
    return <p className="alert alert-danger">ไม่พบออเดอร์ของลูกค้ารายนี้ในวันนี้</p>

  const customerName = orders[0].customer_name_en as string
  const allEditablePacked =
    editableItems.length > 0 && editableItems.every((i) => packedIds.has(i.id))
  const packGateBlocked = !(
    primary &&
    packPhotoCount >= 1 &&
    paper + foam + piece >= 1 &&
    allEditablePacked
  )
  const saveBlocked = busy || photoBusy

  function toggleItemPacked(itemId: string) {
    setPackedIds((s) => {
      const next = new Set(s)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  // Scoped to the editable lines: already-packed POs' ticks are read-only and
  // must neither be cleared nor counted here.
  function toggleAllPacked() {
    setPackedIds((s) => {
      const next = new Set(s)
      if (allEditablePacked) for (const i of editableItems) next.delete(i.id)
      else for (const i of editableItems) next.add(i.id)
      return next
    })
  }

  async function save(markPacked: boolean) {
    if (!primary) return
    setBusy(true)
    setMsg(undefined)
    try {
      await savePackGroup({
        primaryId: primary.id,
        otherIds: others.map((o) => o.id),
        paperCount: paper,
        foamCount: foam,
        pieceCount: piece,
        packerName,
        itemPacked: editableItems.map((i) => ({ id: i.id, packed: packedIds.has(i.id) })),
      })
      if (!markPacked) {
        setMsg('บันทึกแล้ว')
        return
      }
      const done: string[] = []
      try {
        // Primary last: if a later status change fails, the primary (which
        // owns this action's boxes and photos) is still the first
        // not-yet-packed PO, so a retry keeps recording onto the same PO.
        for (const o of [...others, primary]) {
          await updateOrderStatus(o.id, 'packed')
          done.push(o.id)
        }
        setMsg(`บันทึกและทำเครื่องหมายแพ็คเสร็จแล้ว ${done.length} ออเดอร์`)
      } catch (e) {
        setMsg(
          `แพ็คเสร็จแล้ว ${done.length}/${packable.length} ออเดอร์ แล้วเกิดข้อผิดพลาด: ${(e as Error).message} — กดบันทึก + แพ็คเสร็จอีกครั้งเพื่อทำต่อ`,
        )
      } finally {
        setOrders((os) =>
          (os ?? []).map((o) => (done.includes(o.id) ? { ...o, status: 'packed' } : o)),
        )
      }
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

  const { show: showSplit, fresh, dry } = splitFreshDry(items)
  const row = (it: GroupItem) => (
    <PackItemRow
      key={it.id}
      item={it}
      orderNo={it.orderNo}
      checked={packedIds.has(it.id)}
      disabled={!it.editable}
      onToggle={toggleItemPacked}
    />
  )
  const divider = (label: string, n: number) => (
    <tr>
      <td colSpan={8} className="bg-paper text-xs font-semibold text-ink-soft">
        {label} ({n})
      </td>
    </tr>
  )

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`แพ็ครวม · ${customerName} · ${orders.length} ออเดอร์`} />

      <div className="alert alert-info">
        {primary ? (
          <>
            แพ็คเฉพาะ {packable.length} ออเดอร์ที่ยังไม่แพ็ค — ลัง/ชิ้น/รูปจะบันทึกไว้ที่ออเดอร์หลัก{' '}
            <span className="font-semibold">{primary.makro_order_no}</span> ส่วนออเดอร์อื่นจะขึ้นว่า
            &quot;แพ็ครวมกับ {primary.makro_order_no}&quot;
            {orders.length > packable.length &&
              ` · ออเดอร์ที่แพ็คไปแล้ว ${orders.length - packable.length} ออเดอร์แสดงอ่านอย่างเดียว`}
          </>
        ) : (
          'ทุกออเดอร์ของลูกค้ารายนี้แพ็คแล้ว (แสดงอ่านอย่างเดียว)'
        )}{' '}
        <Link className="link" to="/">
          กลับหน้างานวันนี้
        </Link>
      </div>

      {willReset.length > 0 && (
        <div className="alert alert-warn">
          ⚠️ {willReset.map((o) => o.makro_order_no).join(', ')}{' '}
          มีจำนวนลัง/ชิ้นที่บันทึกไว้แล้ว — เมื่อกดบันทึกจะถูกรีเซ็ตเป็น 0
          (ให้นับรวมกับลัง/ชิ้นของออเดอร์หลักด้านล่างแทน)
        </div>
      )}

      {backorders.length > 0 && (
        <div className="alert alert-warn">
          <p className="font-semibold">ของค้างส่งจากออเดอร์ก่อนหน้า</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {backorders.map((b) => (
              <li key={b.id} className="flex items-center gap-3">
                <span>
                  {b.product_name} x{b.qty} <span className="muted text-xs">({b.orderNo})</span>
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => fulfil(b.id)}>
                  ส่งแล้ว
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="section-title">รายการสินค้า ({items.length})</p>
          {editableItems.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={toggleAllPacked}>
              {allEditablePacked ? 'ล้างทั้งหมด' : 'เลือกทั้งหมด'}
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>แพ็ค</th>
                <th>ออเดอร์</th>
                <th>รหัสสินค้า</th>
                <th>สินค้า</th>
                <th>สั่ง</th>
                <th>ส่งจริง</th>
                <th>สถานะ</th>
                <th>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {showSplit ? (
                <>
                  {fresh.length > 0 && divider('ของสด', fresh.length)}
                  {fresh.map(row)}
                  {dry.length > 0 && divider('ของแห้ง', dry.length)}
                  {dry.map(row)}
                </>
              ) : (
                items.map(row)
              )}
            </tbody>
          </table>
        </div>
      </section>

      {primary && (
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
                onFocus={(e) => e.target.select()}
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
                onFocus={(e) => e.target.select()}
              />
            </label>
            <label className="field">
              <span className="field-label">จำนวนชิ้น</span>
              <input
                type="number"
                min={0}
                className="w-24"
                value={piece}
                onChange={(e) => setPiece(+e.target.value)}
                onFocus={(e) => e.target.select()}
              />
            </label>
          </div>
          <label className="field">
            <span className="field-label">ชื่อคนแพ็ค</span>
            <input
              list="packer-name-options"
              className="w-56"
              value={packerName}
              onChange={(e) => setPackerName(e.target.value)}
            />
            <datalist id="packer-name-options">
              {packerNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <p className="muted">
            ลังกระดาษ {paper} · ลังโฟม {foam} · ชิ้น {piece} · รวม {paper + foam + piece}
          </p>
          <section className="flex flex-col gap-2 border-t border-line pt-4">
            <p className="section-title">รูปหลักฐานตอนแพ็ค</p>
            <PhotoCapture
              scope="evidence"
              stage="pack"
              orderId={primary.id}
              initialPhotos={(primary.evidence_photos ?? [])
                .filter((p: any) => p.stage === 'pack')
                .map((p: any) => ({ key: p.r2_key, url: `${R2}/${p.r2_key}` }))}
              onBusyChange={setPhotoBusy}
              onUploaded={async (key) => {
                try {
                  await attachEvidencePhoto(primary.id, key, { stage: 'pack' })
                  setPackPhotoCount((c) => c + 1)
                } catch (e) {
                  setMsg((e as Error).message)
                }
              }}
              onRemoved={async (key) => {
                await removeEvidencePhoto(primary.id, key)
                setPackPhotoCount((c) => Math.max(0, c - 1))
              }}
            />
          </section>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" onClick={() => save(false)} disabled={saveBlocked}>
              บันทึก
            </button>
            <button
              className="btn btn-ok"
              onClick={() => save(true)}
              disabled={saveBlocked || packGateBlocked}
            >
              บันทึก + แพ็คเสร็จ
            </button>
          </div>
          {photoBusy && (
            <p className="muted text-xs">กำลังอัปโหลดรูป กรุณารอสักครู่ก่อนกดบันทึก</p>
          )}
          {!saveBlocked && packGateBlocked && (
            <p className="muted text-xs">
              ต้องถ่ายรูปลังที่แพ็คเสร็จอย่างน้อย 1 รูป กรอกจำนวนลัง/ชิ้นอย่างน้อย 1 และติ๊กสินค้าครบทุกรายการ
            </p>
          )}
        </div>
      )}
      {msg && <p className="muted">{msg}</p>}
    </div>
  )
}
