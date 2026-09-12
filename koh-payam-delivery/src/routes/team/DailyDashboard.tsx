import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listOrdersForDay } from '../../lib/api/shipDays'
import { listBackordersForDay, type BackorderRow } from '../../lib/api/backorders'
import { supabase } from '../../lib/supabase'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Spinner } from '../../components/ui/Spinner'
import { PageHeader } from '../../components/ui/PageHeader'
import QrOrderScanner from '../../components/QrOrderScanner'
import { todayLocalISO } from '../../lib/format'

export default function DailyDashboard() {
  const navigate = useNavigate()
  const [date, setDate] = useState(todayLocalISO())
  const [rows, setRows] = useState<any[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [backorders, setBackorders] = useState<BackorderRow[]>([])
  const [q, setQ] = useState('')
  const [scanOpen, setScanOpen] = useState(false)

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

  // Orders that share a non-blank customer_phone with at least one other row
  // in the same day are "grouped" — the customer split one purchase across
  // multiple POs that ship together. Derived client-side from `rows`, not
  // `filtered`, so the grouping badge is unaffected by the search box.
  const groupedPhones = useMemo(() => {
    const r = rows ?? []
    const counts = new Map<string, number>()
    for (const o of r) {
      const phone = (o.customer_phone ?? '').trim()
      if (!phone) continue
      counts.set(phone, (counts.get(phone) ?? 0) + 1)
    }
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([phone]) => phone),
    )
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
      <div className="flex flex-col items-start gap-3">
        <p className="alert alert-danger">โหลดงานวันนี้ไม่สำเร็จ</p>
        <button className="btn btn-secondary btn-sm" onClick={() => load()}>
          ลองใหม่
        </button>
      </div>
    )
  if (!rows) return <Spinner />

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="งานวันนี้"
        actions={
          <input
            type="date"
            className="w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        }
      />

      <p className="muted">
        แพ็คแล้ว {counts.packed}/{counts.total} · ถึงท่าเรือ {counts.atPier} · ส่งแล้ว{' '}
        {counts.shipped}
      </p>

      {backorders.length > 0 && (
        <div className="alert alert-warn">
          <p className="font-semibold">ของค้างส่ง {backorders.length} รายการรอส่งวันนี้</p>
          <ul className="mt-1.5 list-disc pl-5">
            {backorders.map((b) => (
              <li key={b.id}>
                {b.target_order_id ? (
                  <Link className="link" to={`/order/${b.target_order_id}`}>
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

      <div className="flex items-center gap-2">
        <input
          placeholder="ค้นหาชื่อลูกค้า / เลขออเดอร์"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-label="สแกน QR ออเดอร์"
          onClick={() => setScanOpen((v) => !v)}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2M20 8V6a2 2 0 0 0-2-2h-2M20 16v2a2 2 0 0 1-2 2h-2M4 12h16"
            />
          </svg>
        </button>
      </div>

      {scanOpen && (
        <QrOrderScanner
          onFound={(order) => {
            setScanOpen(false)
            navigate(`/order/${order.id}`)
          }}
          onClose={() => setScanOpen(false)}
        />
      )}

      {filtered.length === 0 ? (
        <p className="muted">ไม่มีออเดอร์</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>เลขออเดอร์</th>
                <th>ลูกค้า</th>
                <th>สถานะ</th>
                <th>รวม</th>
                <th>เรือ</th>
                <th>คนแพ็ค</th>
                <th>คนลงเรือ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td className="whitespace-nowrap">
                    <Link className="link" to={`/order/${o.id}`}>
                      {o.makro_order_no}
                    </Link>
                  </td>
                  <td>{o.customer_name_en}</td>
                  <td>
                    <StatusBadge status={o.status} />
                    {o.outstanding_amount > 0 && (
                      <span className="badge badge-warn ml-1.5">เก็บเงิน</span>
                    )}
                    {groupedPhones.has((o.customer_phone ?? '').trim()) && (
                      <span className="badge badge-neutral ml-1.5">หลาย PO</span>
                    )}
                  </td>
                  <td className="tnum">
                    {o.paper_box_count + o.foam_box_count + o.piece_count}
                  </td>
                  <td className="whitespace-nowrap">{o.boat_id ?? '—'}</td>
                  <td>{o.packer_name || '—'}</td>
                  <td>{o.pier_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
