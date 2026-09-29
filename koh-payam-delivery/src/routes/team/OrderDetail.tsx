import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Anchor, MapPin, Package, Warning } from '@phosphor-icons/react'
import { getOrder, regenTokenLink, deleteOrder } from '../../lib/api/orders'
import {
  listRelatedBackordersForOrder,
  type BackorderRow,
} from '../../lib/api/backorders'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { PageSkeleton } from '../../components/ui/Skeleton'
import { BackLink } from '../../components/ui/BackLink'
import { InfoItem, StatTile } from '../../components/ui/Stat'
import { PhotoGallery } from '../../components/ui/PhotoGallery'
import { splitFreshDry } from '../../lib/freshDry'
import { useAuth } from '../../lib/auth'
import { Notice, flash, type Flash } from '../../components/ui/Notice'
import { AmountDue } from '../../components/ui/AmountDue'
import { groupedItemRows } from '../../components/ui/ItemGroupHeader'
import { StickerPrintButton } from '../../components/StickerPrint'
import { ShippingAddress } from '../../components/ui/ShippingAddress'

export default function OrderDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile } = useAuth()
  const [order, setOrder] = useState<any>(null)
  const [backorders, setBackorders] = useState<BackorderRow[]>([])
  const [failed, setFailed] = useState(false)
  const [msg, setMsg] = useState<Flash>()
  const [busy, setBusy] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const load = useCallback(() => {
    getOrder(id!)
      .then(setOrder)
      .catch(() => setFailed(true))
  }, [id])

  useEffect(() => {
    load()
    listRelatedBackordersForOrder(id!)
      .then(setBackorders)
      .catch(() => setBackorders([]))
  }, [id, load])

  if (failed) return <p className="alert alert-danger">โหลดออเดอร์ไม่สำเร็จ</p>
  if (!order) return <PageSkeleton />

  const link = `${location.origin}/o/${order.link_token}`
  const items: any[] = order.order_items ?? []
  const { show: showFreshDrySplit, fresh: freshItems, dry: dryItems } = splitFreshDry(items)
  const claims: any[] = order.claims ?? []
  const photos: any[] = order.evidence_photos ?? []
  const packPhotos = photos.filter((p) => p.stage === 'pack')
  const handoffPhotos = photos.filter((p) => p.stage !== 'pack')

  async function regen() {
    setBusy(true)
    setMsg(undefined)
    try {
      await regenTokenLink(id!)
      load()
      setMsg(flash.ok('สร้างลิงก์ใหม่แล้ว'))
    } catch (e) {
      setMsg(flash.error((e as Error).message))
    } finally {
      setBusy(false)
    }
  }

  async function doDelete() {
    setBusy(true)
    setMsg(undefined)
    try {
      await deleteOrder(id!, {
        makroOrderNo: order.makro_order_no,
        customerNameEn: order.customer_name_en,
        status: order.status,
        shipDate: order.ship_date,
      })
      nav('/')
    } catch (e) {
      setMsg(flash.error((e as Error).message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col border-b border-line pb-4">
        <BackLink to="/" label="งานวันนี้" />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="page-title">
            {order.makro_order_no} · {order.customer_name_en}
          </h1>
          <StatusBadge status={order.status} />
        </div>
      </header>

      {order.outstanding_amount != null && order.outstanding_amount > 0 && (
        <AmountDue
          label="เก็บเงินปลายทาง"
          amount={order.outstanding_amount}
          note={order.payment_method}
        />
      )}

      <section className="card flex flex-col gap-4" aria-label="สรุปการจัดส่ง">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="ลังกระดาษ" value={order.paper_box_count} />
          <StatTile label="ลังโฟม" value={order.foam_box_count} />
          <StatTile label="ชิ้น" value={order.piece_count} />
          <StatTile
            label="รวม"
            value={order.paper_box_count + order.foam_box_count + order.piece_count}
            emphasis
          />
        </dl>
        <dl className="grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
          <InfoItem icon={MapPin} label="ส่งที่" value={order.sub_district} />
          <InfoItem icon={Package} label="คนแพ็ค" value={order.packer_name} />
          <InfoItem icon={Anchor} label="คนลงเรือ" value={order.pier_name} />
        </dl>
      </section>
      <ShippingAddress addresses={[order.shipping_address]} />

      {order.packed_with?.makro_order_no && (
        <p className="alert alert-info">
          แพ็ครวมกับออเดอร์{' '}
          <Link className="link" to={`/order/${order.packed_with_order_id}`}>
            {order.packed_with.makro_order_no}
          </Link>{' '}
          — ลัง/ชิ้น/รูปตอนแพ็คบันทึกไว้ที่ออเดอร์นั้น
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          className="btn btn-ok min-h-[3.25rem] flex-1 text-lg"
          to={`/order/${id}/pack`}
        >
          แพ็คของ
        </Link>
        <StickerPrintButton
          className="btn btn-warn min-h-[3.25rem] flex-1 text-lg"
          customer={order}
          counts={{
            paper: order.paper_box_count ?? 0,
            foam: order.foam_box_count ?? 0,
            piece: order.piece_count ?? 0,
          }}
        />
      </div>

      <div className="card flex flex-col gap-2 text-sm">
        <p className="section-title">ลิงก์ลูกค้า</p>
        <p className="break-all font-mono text-xs text-ink-soft">{link}</p>
        <div className="flex gap-2">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigator.clipboard.writeText(link)}
          >
            คัดลอก
          </button>
          <button className="btn btn-secondary btn-sm" onClick={regen} disabled={busy}>
            สร้างลิงก์ใหม่
          </button>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <p className="section-title">รายการสินค้า</p>
        <div className="table-wrap">
          <table className="data-table stack-table">
            <thead>
              <tr>
                <th className="w-10 text-right">#</th>
                <th>แพ็ค</th>
                <th>รหัสสินค้า</th>
                <th>สินค้า</th>
                <th>สั่ง</th>
                <th>ส่งจริง</th>
                <th />
                <th>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {groupedItemRows({
                split: showFreshDrySplit,
                fresh: freshItems,
                dry: dryItems,
                all: items,
                colSpan: 8,
                row: (it, no) => <OrderDetailItemRow key={it.id} item={it} no={no} />,
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="text-sm">
        <p className="section-title">เคลมของออเดอร์นี้</p>
        {claims.length === 0 ? (
          <p className="muted mt-1">ไม่มีเคลม</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {claims.map((c) => (
              <li key={c.id}>
                <Link className="link" to={`/claims/${c.id}`}>
                  เคลม #{c.id} · {c.status}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="text-sm">
        <p className="section-title">รูปตอนแพ็ค</p>
        {packPhotos.length === 0 ? (
          <p className="muted mt-1">ไม่มีรูป</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-2">
            <PhotoGallery
              photos={packPhotos.map((p) => ({ src: `${import.meta.env.VITE_R2_PUBLIC_BASE_URL}/${p.r2_key}`, alt: 'หลักฐาน' }))}
            />
          </div>
        )}
      </section>

      <section className="text-sm">
        <p className="section-title">รูปตอนส่งขึ้นเรือ</p>
        {handoffPhotos.length === 0 ? (
          <p className="muted mt-1">ไม่มีรูป</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-2">
            <PhotoGallery
              photos={handoffPhotos.map((p) => ({ src: `${import.meta.env.VITE_R2_PUBLIC_BASE_URL}/${p.r2_key}`, alt: 'หลักฐาน' }))}
            />
          </div>
        )}
      </section>

      <section className="text-sm">
        <p className="section-title">รายการค้างส่งที่เกี่ยวข้อง</p>
        {backorders.length === 0 ? (
          <p className="muted mt-1">ไม่มี</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-ink-soft">
            {backorders.map((b) => (
              <li key={b.id}>
                {b.product_name} x{b.qty} · {b.reason} · {b.status}
                {b.source_order_id === id ? ' (ต้นทาง)' : ''}
                {b.target_order_id === id ? ' (ปลายทาง)' : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      {profile?.role === 'manager' && (
        <section className="card flex flex-col gap-3 text-sm">
          <p className="section-title">พื้นที่อันตราย</p>
          {!deleteOpen ? (
            <button
              className="btn btn-danger btn-sm self-start"
              onClick={() => setDeleteOpen(true)}
            >
              ลบออเดอร์นี้
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              {order.status === 'shipped' && (
                <div className="alert alert-danger flex items-start gap-2">
                  <Warning size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
                  <p>
                    ออเดอร์นี้ส่งขึ้นเรือแล้ว ลูกค้าอาจเคยเห็นลิงก์หรือเคยแจ้งเคลมไปแล้ว —
                    การลบจะลบข้อมูลเคลมที่เกี่ยวข้องไปด้วยถาวร
                  </p>
                </div>
              )}
              <label className="field">
                <span className="field-label">
                  พิมพ์เลขออเดอร์ {order.makro_order_no} เพื่อยืนยันการลบถาวร
                </span>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
              </label>
              <div className="flex gap-2">
                <button
                  className="btn btn-danger"
                  onClick={doDelete}
                  disabled={busy || confirmText !== order.makro_order_no}
                >
                  ลบถาวร
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setDeleteOpen(false)}
                  disabled={busy}
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <Notice flash={msg} />
    </div>
  )
}

function OrderDetailItemRow({ item: it, no }: { item: any; no: number }) {
  return (
    <tr>
      <td className="row-no" aria-label={`ลำดับที่ ${no}`}>
        {no}
      </td>
      <td className="stack-tick">
        <input
          type="checkbox"
          aria-label={`แพ็คแล้ว: ${it.product_name}`}
          checked={!!it.packed}
          disabled
          readOnly
        />
      </td>
      <td data-label="รหัสสินค้า" className="tnum">
        {it.makro_item_id}
      </td>
      <td className="stack-lead">{it.product_name}</td>
      <td data-label="สั่ง" className="tnum">
        {it.qty_ordered}
      </td>
      <td data-label="ส่งจริง" className="tnum">
        {it.qty_shipped}
      </td>
      <td data-label={it.status === 'short' ? 'สถานะ' : ''}>
        {it.status === 'short' && <span className="badge badge-warn">ขาด</span>}
      </td>
      <td data-label={it.item_remark ? 'หมายเหตุ' : ''}>{it.item_remark}</td>
    </tr>
  )
}
