import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getOrder, updateOrderStatus, regenTokenLink } from '../../lib/api/orders'
import {
  listRelatedBackordersForOrder,
  type BackorderRow,
} from '../../lib/api/backorders'
import { computeCreditSummary } from '../../lib/credit'
import { nextStatus, type OrderStatus } from '../../lib/status'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { CreditSummaryTable } from '../../components/CreditSummaryTable'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { formatTHB } from '../../lib/format'

const STATUS_LABEL: Record<OrderStatus, string> = {
  imported: 'นำเข้าแล้ว',
  // TODO R2: 'packing' removed from the flow (Batch R1 Task 6); Task 10 owns the rest of this file
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

  if (failed) return <p className="text-sm text-red-600">โหลดออเดอร์ไม่สำเร็จ</p>
  if (!order) return <Spinner />

  const link = `${location.origin}/o/${order.link_token}`
  const next = nextStatus(order.status as OrderStatus)
  const items: any[] = order.order_items ?? []
  const claims: any[] = order.claims ?? []
  const photos: any[] = order.evidence_photos ?? []
  // I4: moving an order to the pier / onto a boat requires a chosen boat AND at
  // least one evidence photo — both captured on the "ที่ท่าเรือ" screen.
  const pierBlocked =
    (next === 'at_pier' || next === 'shipped') && !(order.boat_id && photos.length >= 1)
  const summary = computeCreditSummary({
    totalValue: order.total_value_cached ?? 0,
    items,
    claims,
  })

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
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">
          {order.makro_order_no} · {order.customer_name_en}
        </h1>
        <StatusBadge status={order.status} />
        {next && (
          <div className="flex flex-col items-start gap-1">
            <Button onClick={advance} disabled={busy || pierBlocked}>
              เปลี่ยนเป็น {STATUS_LABEL[next]}
            </Button>
            {pierBlocked && (
              <p className="text-xs text-gray-500">
                ต้องเลือกเรือและถ่ายรูปหลักฐานที่หน้า "ที่ท่าเรือ" ก่อน
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-4 text-sm underline">
        <Link to={`/order/${id}/pack`}>แพ็คของ</Link>
        <Link to={`/order/${id}/label`}>ใบเขียนหน้าลัง</Link>
      </div>

      <div className="flex flex-col gap-1 rounded border p-3 text-sm">
        <p className="font-medium">ลิงก์ลูกค้า</p>
        <p className="break-all">{link}</p>
        <div className="flex gap-2">
          <button
            className="rounded border px-2 py-0.5"
            onClick={() => navigator.clipboard.writeText(link)}
          >
            คัดลอก
          </button>
          <button className="rounded border px-2 py-0.5" onClick={regen} disabled={busy}>
            สร้างลิงก์ใหม่
          </button>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th>สินค้า</th>
            <th>จำนวน</th>
            <th>ราคา/หน่วย</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-t">
              <td>{it.product_name}</td>
              <td>{it.qty_ordered}</td>
              <td>{formatTHB(it.unit_price)}</td>
              <td>{it.status === 'short' ? 'ของขาด' : 'ครบ'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <CreditSummaryTable summary={summary} lang="th" />

      <div className="text-sm">
        <p className="font-medium">เคลมของออเดอร์นี้</p>
        {claims.length === 0 ? (
          <p className="text-gray-500">ไม่มีเคลม</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {claims.map((c) => (
              <li key={c.id}>
                <Link className="underline" to={`/claims/${c.id}`}>
                  เคลม #{c.id} · {c.status}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-sm">
        <p className="font-medium">รูปหลักฐาน</p>
        {photos.length === 0 ? (
          <p className="text-gray-500">ไม่มีรูป</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => (
              <img
                key={p.id ?? p.r2_key}
                src={`${import.meta.env.VITE_R2_PUBLIC_BASE_URL}/${p.r2_key}`}
                alt="หลักฐาน"
                className="h-24 w-24 rounded object-cover"
              />
            ))}
          </div>
        )}
      </div>

      <div className="text-sm">
        <p className="font-medium">รายการค้างส่งที่เกี่ยวข้อง</p>
        {backorders.length === 0 ? (
          <p className="text-gray-500">ไม่มี</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {backorders.map((b) => (
              <li key={b.id}>
                {b.product_name} x{b.qty} · {b.reason} · {b.status}
                {b.source_order_id === id ? ' (ต้นทาง)' : ''}
                {b.target_order_id === id ? ' (ปลายทาง)' : ''}
              </li>
            ))}
          </ul>
        )}
      </div>

      {msg && <p className="text-sm">{msg}</p>}
    </div>
  )
}
