import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getOrder, updateOrderStatus } from '../../lib/api/orders'
import { savePack, listDistinctPackerNames } from '../../lib/api/pack'
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

const R2 = import.meta.env.VITE_R2_PUBLIC_BASE_URL as string

export type ItemState = {
  id: string
  product_name: string
  makro_item_id: string | null
  qty_ordered: number
  qty_shipped: number
  item_remark: string | null
  status: 'ok' | 'short'
  is_fresh: boolean | null
  packed: boolean
}

export default function PackOrder() {
  const { id } = useParams()
  const [order, setOrder] = useState<any>(null)
  const [items, setItems] = useState<ItemState[]>([])
  const [packedIds, setPackedIds] = useState<Set<string>>(new Set())
  const [backorders, setBackorders] = useState<BackorderRow[]>([])
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
    getOrder(id!)
      .then((o: any) => {
        setOrder(o)
        const its = o.order_items.map((it: any) => ({ ...it }))
        setItems(its)
        setPackedIds(new Set(its.filter((it: ItemState) => it.packed).map((it: ItemState) => it.id)))
        setPaper(o.paper_box_count)
        setFoam(o.foam_box_count)
        setPiece(o.piece_count)
        setPackerName(o.packer_name ?? '')
        setPackPhotoCount(
          (o.evidence_photos ?? []).filter((p: any) => p.stage === 'pack').length,
        )
      })
      .catch(() => setFailed(true))
    listPendingBackordersForOrder(id!)
      .then(setBackorders)
      .catch(() => setBackorders([]))
    listDistinctPackerNames()
      .then(setPackerNames)
      .catch(() => setPackerNames([]))
  }, [id])

  if (failed) return <p className="alert alert-danger">โหลดออเดอร์ไม่สำเร็จ</p>
  if (!order) return <Spinner />

  async function save(markPacked: boolean) {
    setBusy(true)
    setMsg(undefined)
    try {
      await savePack({
        orderId: id!,
        paperCount: paper,
        foamCount: foam,
        pieceCount: piece,
        packerName,
        itemPacked: items.map((it) => ({ id: it.id, packed: packedIds.has(it.id) })),
      })
      if (markPacked) await updateOrderStatus(id!, 'packed')
      setMsg(markPacked ? 'บันทึกและทำเครื่องหมายแพ็คเสร็จแล้ว' : 'บันทึกแล้ว')
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // I: marking an order packed needs at least one "packed box" evidence photo,
  // at least one item counted -- some POs ship as loose pieces with no
  // paper/foam box at all, so the count can come from any of the three
  // fields -- AND every line item ticked as physically packed. The plain
  // "บันทึก" save stays ungated.
  const allItemsPacked = items.length > 0 && items.every((it) => packedIds.has(it.id))
  const packGateBlocked = !(packPhotoCount >= 1 && paper + foam + piece >= 1 && allItemsPacked)

  function toggleItemPacked(itemId: string) {
    setPackedIds((s) => {
      const next = new Set(s)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  function toggleAllPacked() {
    setPackedIds((s) => (s.size === items.length ? new Set() : new Set(items.map((it) => it.id))))
  }

  const { show: showFreshDrySplit, fresh: freshItems, dry: dryItems } = splitFreshDry(items)
  // A photo can take real time on a weak connection; block both save actions
  // while one is still uploading so a user can't navigate away mid-upload and
  // think it was lost (it wasn't — it just hadn't landed yet).
  const saveBlocked = busy || photoBusy

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="section-title">รายการสินค้า</p>
          {items.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={toggleAllPacked}>
              {packedIds.size === items.length ? 'ล้างทั้งหมด' : 'เลือกทั้งหมด'}
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>แพ็ค</th>
                <th>รหัสสินค้า</th>
                <th>สินค้า</th>
                <th>สั่ง</th>
                <th>ส่งจริง</th>
                <th>สถานะ</th>
                <th>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {showFreshDrySplit ? (
                <>
                  {freshItems.length > 0 && (
                    <tr>
                      <td colSpan={7} className="bg-paper text-xs font-semibold text-ink-soft">
                        ของสด ({freshItems.length})
                      </td>
                    </tr>
                  )}
                  {freshItems.map((it) => (
                    <PackItemRow
                      key={it.id}
                      item={it}
                      checked={packedIds.has(it.id)}
                      onToggle={toggleItemPacked}
                    />
                  ))}
                  {dryItems.length > 0 && (
                    <tr>
                      <td colSpan={7} className="bg-paper text-xs font-semibold text-ink-soft">
                        ของแห้ง ({dryItems.length})
                      </td>
                    </tr>
                  )}
                  {dryItems.map((it) => (
                    <PackItemRow
                      key={it.id}
                      item={it}
                      checked={packedIds.has(it.id)}
                      onToggle={toggleItemPacked}
                    />
                  ))}
                </>
              ) : (
                items.map((it) => (
                  <PackItemRow
                    key={it.id}
                    item={it}
                    checked={packedIds.has(it.id)}
                    onToggle={toggleItemPacked}
                  />
                ))
              )}
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
            orderId={id}
            initialPhotos={(order.evidence_photos ?? [])
              .filter((p: any) => p.stage === 'pack')
              .map((p: any) => ({ key: p.r2_key, url: `${R2}/${p.r2_key}` }))}
            onBusyChange={setPhotoBusy}
            onUploaded={async (key) => {
              try {
                await attachEvidencePhoto(id!, key, { stage: 'pack' })
                setPackPhotoCount((c) => c + 1)
              } catch (e) {
                setMsg((e as Error).message)
              }
            }}
            onRemoved={async (key) => {
              await removeEvidencePhoto(id!, key)
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
        {msg && <p className="muted">{msg}</p>}
      </div>
    </div>
  )
}

export function PackItemRow({
  item: it,
  checked,
  onToggle,
  orderNo,
  disabled,
}: {
  item: ItemState
  checked: boolean
  onToggle: (id: string) => void
  // Combined pack page only: which PO this line came from, and whether it is
  // read-only because that PO is already packed.
  orderNo?: string
  disabled?: boolean
}) {
  return (
    <tr>
      <td>
        <input
          type="checkbox"
          aria-label={`แพ็คแล้ว: ${it.product_name}`}
          checked={checked}
          disabled={disabled}
          onChange={() => onToggle(it.id)}
        />
      </td>
      {orderNo !== undefined && (
        <td className="whitespace-nowrap text-xs text-ink-soft">{orderNo}</td>
      )}
      <td className="tnum">{it.makro_item_id}</td>
      <td>{it.product_name}</td>
      <td className="tnum">{it.qty_ordered}</td>
      <td className="tnum">{it.qty_shipped}</td>
      <td>{it.status === 'short' && <span className="badge badge-danger">ขาด</span>}</td>
      <td>{it.item_remark}</td>
    </tr>
  )
}
