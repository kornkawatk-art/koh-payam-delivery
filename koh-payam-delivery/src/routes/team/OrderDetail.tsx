import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getOrder, updateOrderStatus, regenTokenLink } from '../../lib/api/orders'
import {
  listRelatedBackordersForOrder,
  type BackorderRow,
} from '../../lib/api/backorders'
import { nextStatus, type OrderStatus } from '../../lib/status'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Spinner } from '../../components/ui/Spinner'
import { formatTHB } from '../../lib/format'

const STATUS_LABEL: Record<OrderStatus, string> = {
  imported: 'นำเข้าแล้ว',
  packed: 'แพ็คเสร็จ',
  at_pier: 'ถึงท่าเรือ',
  shipped: 'ส่งแล้ว',
}

export default function OrderDetail() {
  const { id } = useParams()
  const [order, setOrder] = useState<any>(null)
  const [backorders, setBackorders] = useState<BackorderRow[]>([])
  const [failed, setFailed] = useState(false)
  const [msg, setMsg] = useState<string>()
  const [busy, setBusy] = useState(false)

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
  if (!order) return <Spinner />

  const link = `${location.origin}/o/${order.link_token}`
  const next = nextStatus(order.status as OrderStatus)
  const items: any[] = order.order_items ?? []
  const claims: any[] = order.claims ?? []
  const photos: any[] = order.evidence_photos ?? []
  const packPhotos = photos.filter((p) => p.stage === 'pack')
  const handoffPhotos = photos.filter((p) => p.stage !== 'pack')
  // I4: moving an order to the pier / onto a boat requires a chosen boat AND at
  // least one handoff evidence photo — both captured on the "ที่ท่าเรือ" screen.
  // Pack-stage photos do not satisfy this gate.
  const pierBlocked =
    (next === 'at_pier' || next === 'shipped') &&
    !(order.boat_id && handoffPhotos.length >= 1)

  async function advance() {
    if (!next) return
    setBusy(true)
    setMsg(undefined)
    try {
      await updateOrderStatus(id!, next)
      load()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function regen() {
    setBusy(true)
    setMsg(undefined)
    try {
      await regenTokenLink(id!)
      load()
      setMsg('สร้างลิงก์ใหม่แล้ว')
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="page-title">
            {order.makro_order_no} · {order.customer_name_en}
          </h1>
          <StatusBadge status={order.status} />
        </div>
        {next && (
          <div className="flex flex-col items-start gap-1">
            <button
              className="btn btn-primary"
              onClick={advance}
              disabled={busy || pierBlocked}
            >
              เปลี่ยนเป็น {STATUS_LABEL[next]}
            </button>
            {pierBlocked && (
              <p className="muted text-xs">
                ต้องเลือกเรือและถ่ายรูปหลักฐานที่หน้า "ที่ท่าเรือ" ก่อน
              </p>
            )}
          </div>
        )}
      </header>

      {order.outstanding_amount != null && order.outstanding_amount > 0 && (
        <p className="alert alert-warn">
          เก็บเงินปลายทาง {formatTHB(order.outstanding_amount)} ({order.payment_method})
        </p>
      )}

      <p className="muted">ส่งที่: {order.sub_district || '—'}</p>

      <div className="flex gap-4 text-sm">
        <Link className="link" to={`/order/${id}/pack`}>
          แพ็คของ
        </Link>
        <Link className="link" to={`/order/${id}/label`}>
          ใบเขียนหน้าลัง
        </Link>
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
          <table className="data-table">
            <thead>
              <tr>
                <th>รหัสสินค้า</th>
                <th>สินค้า</th>
                <th>สั่ง</th>
                <th>ส่งจริง</th>
                <th />
                <th>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="tnum">{it.makro_item_id}</td>
                  <td>{it.product_name}</td>
                  <td className="tnum">{it.qty_ordered}</td>
                  <td className="tnum">{it.qty_shipped}</td>
                  <td>
                    {it.status === 'short' && <span className="badge badge-warn">ขาด</span>}
                  </td>
                  <td>{it.item_remark}</td>
                </tr>
              ))}
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
            {packPhotos.map((p) => (
              <img
                key={p.id ?? p.r2_key}
                src={`${import.meta.env.VITE_R2_PUBLIC_BASE_URL}/${p.r2_key}`}
                alt="หลักฐาน"
                className="h-24 w-24 rounded-lg border border-line object-cover"
              />
            ))}
          </div>
        )}
      </section>

      <section className="text-sm">
        <p className="section-title">รูปตอนส่งขึ้นเรือ</p>
        {handoffPhotos.length === 0 ? (
          <p className="muted mt-1">ไม่มีรูป</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-2">
            {handoffPhotos.map((p) => (
              <img
                key={p.id ?? p.r2_key}
                src={`${import.meta.env.VITE_R2_PUBLIC_BASE_URL}/${p.r2_key}`}
                alt="หลักฐาน"
                className="h-24 w-24 rounded-lg border border-line object-cover"
              />
            ))}
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

      {msg && <p className="muted">{msg}</p>}
    </div>
  )
}
