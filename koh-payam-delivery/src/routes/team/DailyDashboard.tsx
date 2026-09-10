import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listOrdersForDay } from '../../lib/api/shipDays'
import { listBackordersForDay, type BackorderRow } from '../../lib/api/backorders'
import { supabase } from '../../lib/supabase'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Spinner } from '../../components/ui/Spinner'
import { formatTHB, todayLocalISO } from '../../lib/format'

export default function DailyDashboard() {
  const [date, setDate] = useState(todayLocalISO())
  const [rows, setRows] = useState<any[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [backorders, setBackorders] = useState<BackorderRow[]>([])
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setRows(await listOrdersForDay(date))
    } catch {
      setFailed(true)
    }
  }, [date])

  useEffect(() => {
    let active = true
    listBackordersForDay(date)
      .then((b) => {
        if (active) setBackorders(b)
      })
      .catch(() => {
        if (active) setBackorders([])
      })
    return () => {
      active = false
    }
  }, [date])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('orders-' + date)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `ship_date=eq.${date}` },
        load,
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [date, load])

  const counts = useMemo(() => {
    const r = rows ?? []
    return {
      total: r.length,
      packed: r.filter((o) => ['packed', 'at_pier', 'shipped'].includes(o.status)).length,
      atPier: r.filter((o) => ['at_pier', 'shipped'].includes(o.status)).length,
      shipped: r.filter((o) => o.status === 'shipped').length,
    }
  }, [rows])

  const filtered = useMemo(() => {
    const r = rows ?? []
    const s = q.trim().toLowerCase()
    return s
      ? r.filter(
          (o) =>
            o.customer_name_en.toLowerCase().includes(s) ||
            o.makro_order_no.toLowerCase().includes(s),
        )
      : r
  }, [rows, q])

  if (failed)
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-red-600">โหลดงานวันนี้ไม่สำเร็จ</p>
        <button className="rounded border px-3 py-1 text-sm" onClick={() => load()}>
          ลองใหม่
        </button>
      </div>
    )
  if (!rows) return <Spinner />
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">งานวันนี้</h1>
        <input
          type="date"
          className="rounded border p-1"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <p className="text-sm text-gray-600">
        แพ็คแล้ว {counts.packed}/{counts.total} · ถึงท่าเรือ {counts.atPier} · ส่งแล้ว{' '}
        {counts.shipped}
      </p>
      {backorders.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
          <p className="font-medium">ของค้างส่ง {backorders.length} รายการรอส่งวันนี้</p>
          <ul className="mt-1 list-disc pl-5">
            {backorders.map((b) => (
              <li key={b.id}>
                {b.target_order_id ? (
                  <Link className="underline" to={`/order/${b.target_order_id}`}>
                    {b.product_name} x{b.qty}
                  </Link>
                ) : (
                  <span>
                    {b.product_name} x{b.qty}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <input
        placeholder="ค้นหาชื่อลูกค้า / เลขออเดอร์"
        className="rounded border p-2"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th>เลขออเดอร์</th>
            <th>ลูกค้า</th>
            <th>สถานะ</th>
            <th>ลัง</th>
            <th>เรือ</th>
            <th>มูลค่า</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((o) => (
            <tr key={o.id} className="border-t">
              <td>
                <Link className="underline" to={`/order/${o.id}`}>
                  {o.makro_order_no}
                </Link>
              </td>
              <td>{o.customer_name_en}</td>
              <td>
                <StatusBadge status={o.status} />
              </td>
              <td>{o.paper_box_count + o.foam_box_count}</td>
              <td>{o.boat_id ?? '—'}</td>
              <td>{formatTHB(o.total_value_cached)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
