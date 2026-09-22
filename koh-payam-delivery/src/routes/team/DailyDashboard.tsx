import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listOrdersForDay, getShipDayLinksSentAt, sendOrderLinks } from '../../lib/api/shipDays'
import { listBackordersForDay, type BackorderRow } from '../../lib/api/backorders'
import { supabase } from '../../lib/supabase'
import {
  House,
  Package,
  MapPin,
  CheckCircle,
  Warning,
  QrCode,
  CaretDown,
  CaretRight,
} from '@phosphor-icons/react'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Spinner } from '../../components/ui/Spinner'
import { PageHeader } from '../../components/ui/PageHeader'
import QrOrderScanner from '../../components/QrOrderScanner'
import { todayLocalISO } from '../../lib/format'
import { groupByPhone, entryOrders, entryHasUnpacked, type DayEntry } from '../../lib/groupOrders'

export default function DailyDashboard() {
  const navigate = useNavigate()
  const [date, setDate] = useState(todayLocalISO())
  const [rows, setRows] = useState<any[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [backorders, setBackorders] = useState<BackorderRow[]>([])
  const [q, setQ] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  // undefined = not loaded yet (don't flash the banner while unknown)
  const [linksSentAt, setLinksSentAt] = useState<string | null | undefined>(undefined)
  const [linkSendBusy, setLinkSendBusy] = useState(false)
  const [linkSendMsg, setLinkSendMsg] = useState<string>()

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
    let active = true
    setLinksSentAt(undefined)
    setLinkSendMsg(undefined)
    // Only today's send status is ever actionable (send-order-links itself
    // silently skips any other date -- see its own file header), so don't
    // bother the server for a date this page could never offer to send for.
    if (date !== todayLocalISO()) return
    getShipDayLinksSentAt(date)
      .then((v) => {
        if (active) setLinksSentAt(v)
      })
      .catch(() => {
        if (active) setLinksSentAt(null)
      })
    return () => {
      active = false
    }
  }, [date])

  // Manual catch-all for a day nobody opened "ตั้งค่าเรือประจำวัน" for (the
  // only other place that triggers a send) -- e.g. the boat list from
  // yesterday is still fine so nobody saves it again. Safe to press more than
  // once: the edge function itself is idempotent per ship day.
  async function sendLinksNow() {
    setLinkSendBusy(true)
    setLinkSendMsg(undefined)
    try {
      const { sent, skipped } = await sendOrderLinks(date)
      setLinkSendMsg(skipped ? 'ส่งลิงก์ไลน์ไปแล้วก่อนหน้านี้' : `ส่งลิงก์ไลน์ ${sent} ฉบับ`)
      setLinksSentAt(new Date().toISOString())
    } catch (e) {
      setLinkSendMsg((e as Error).message)
    } finally {
      setLinkSendBusy(false)
    }
  }

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

  // One entry per customer: POs sharing a phone on this day collapse into a
  // group row (see groupByPhone). Grouped from ALL rows -- the search box then
  // keeps any entry with a matching PO, so a group never loses members to it.
  const entries = useMemo(() => groupByPhone<any>(rows ?? []), [rows])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s
      ? entries.filter((e) =>
          entryOrders(e).some(
            (o) =>
              o.customer_name_en.toLowerCase().includes(s) ||
              o.makro_order_no.toLowerCase().includes(s),
          ),
        )
      : entries
  }, [entries, q])

  // Not-yet-packed entries float to the top so the packing queue for the day
  // is obvious at a glance; everything past "packed" (packed/at_pier/shipped
  // -- same grouping as the counts.packed tile above) sinks below a divider.
  // A customer group stays on top while any of its POs is still just imported.
  const notPacked = useMemo(() => filtered.filter((e) => entryHasUnpacked(e)), [filtered])
  const packedOrAhead = useMemo(() => filtered.filter((e) => !entryHasUnpacked(e)), [filtered])

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
        icon={House}
        accent="indigo"
        actions={
          <input
            type="date"
            className="w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        }
      />

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 shadow-card">
          <Package size={14} className="text-accent-amber" aria-hidden="true" />
          <span className="text-ink-soft">แพ็คแล้ว</span>
          <span className="tnum font-semibold text-ink">
            {counts.packed}/{counts.total}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 shadow-card">
          <MapPin size={14} className="text-accent-teal" aria-hidden="true" />
          <span className="text-ink-soft">ถึงท่าเรือ</span>
          <span className="tnum font-semibold text-ink">{counts.atPier}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 shadow-card">
          <CheckCircle size={14} weight="fill" className="text-ok" aria-hidden="true" />
          <span className="text-ink-soft">ส่งแล้ว</span>
          <span className="tnum font-semibold text-ink">{counts.shipped}</span>
        </span>
      </div>

      {linksSentAt === null && rows.length > 0 && (
        <div className="alert alert-warn">
          <p className="flex flex-wrap items-center gap-1.5 font-semibold">
            <Warning size={16} weight="fill" aria-hidden="true" />
            ยังไม่ได้ส่งลิงก์ไลน์ให้ลูกค้าวันนี้
            <button
              type="button"
              className="btn btn-warn btn-sm ml-1"
              onClick={sendLinksNow}
              disabled={linkSendBusy}
            >
              ส่งลิงก์ไลน์เลย
            </button>
          </p>
          {linkSendMsg && <p className="mt-1 text-sm">{linkSendMsg}</p>}
        </div>
      )}

      {linksSentAt !== null && linkSendMsg && (
        <div className="alert alert-ok">
          <p>{linkSendMsg}</p>
        </div>
      )}

      {backorders.length > 0 && (
        <div className="alert alert-warn">
          <p className="flex items-center gap-1.5 font-semibold">
            <Warning size={16} weight="fill" aria-hidden="true" />
            ของค้างส่ง {backorders.length} รายการรอส่งวันนี้
          </p>
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
          <QrCode size={18} aria-hidden="true" />
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
              {notPacked.length > 0 && (
                <tr>
                  <td colSpan={7} className="bg-paper text-xs font-semibold text-ink-soft">
                    ยังไม่แพ็ค ({notPacked.length})
                  </td>
                </tr>
              )}
              {notPacked.map((e) => (
                <EntryRows key={entryKey(e)} entry={e} date={date} />
              ))}
              {packedOrAhead.length > 0 && (
                <tr>
                  <td colSpan={7} className="bg-paper text-xs font-semibold text-ink-soft">
                    แพ็คแล้ว ({packedOrAhead.length})
                  </td>
                </tr>
              )}
              {packedOrAhead.map((e) => (
                <EntryRows key={entryKey(e)} entry={e} date={date} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function entryKey(e: DayEntry<any>) {
  return e.kind === 'single' ? e.order.id : `g-${e.phone}`
}

const uniq = (xs: (string | null | undefined)[]) =>
  Array.from(new Set(xs.filter((x): x is string => !!x)))

function EntryRows({ entry, date }: { entry: DayEntry<any>; date: string }) {
  if (entry.kind === 'single') return <OrderRow order={entry.order} />
  return <GroupRows group={entry} date={date} />
}

function GroupRows({
  group,
  date,
}: {
  group: Extract<DayEntry<any>, { kind: 'group' }>
  date: string
}) {
  const [open, setOpen] = useState(false)
  const os = group.orders
  const packed = os.filter((o) => o.status !== 'imported').length
  const boats = uniq(os.map((o) => o.boat_id))
  return (
    <>
      <tr className="bg-brand-soft/40">
        <td className="whitespace-nowrap">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 font-medium"
            aria-expanded={open}
            aria-label={`${open ? 'ยุบ' : 'ขยาย'}ออเดอร์ของ ${group.name}`}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <CaretDown size={14} aria-hidden="true" /> : <CaretRight size={14} aria-hidden="true" />}
            <span className="badge badge-brand">{os.length} PO</span>
          </button>
        </td>
        <td>
          <span className="font-medium">{group.name}</span>
          <Link
            className="btn btn-ok btn-sm ml-2"
            to={`/customer/${date}/${encodeURIComponent(group.phone)}/pack`}
          >
            แพ็ครวม
          </Link>
        </td>
        <td>
          <span className={`badge ${packed === os.length ? 'badge-ok' : 'badge-neutral'}`}>
            แพ็คแล้ว {packed}/{os.length}
          </span>
          {os.some((o) => o.outstanding_amount > 0) && (
            <span className="badge badge-warn ml-1.5">เก็บเงิน</span>
          )}
        </td>
        <td className="tnum">
          {os.reduce((n, o) => n + o.paper_box_count + o.foam_box_count + o.piece_count, 0)}
        </td>
        <td className="whitespace-nowrap">{boats.length ? boats.join(', ') : '—'}</td>
        <td>{uniq(os.map((o) => o.packer_name)).join(', ') || '—'}</td>
        <td>{uniq(os.map((o) => o.pier_name)).join(', ') || '—'}</td>
      </tr>
      {open && os.map((o) => <OrderRow key={o.id} order={o} indent />)}
    </>
  )
}

function OrderRow({ order: o, indent }: { order: any; indent?: boolean }) {
  return (
    <tr>
      <td className={`whitespace-nowrap ${indent ? 'pl-8' : ''}`}>
        <Link className="link" to={`/order/${o.id}`}>
          {o.makro_order_no}
        </Link>
      </td>
      <td>{o.customer_name_en}</td>
      <td>
        <StatusBadge status={o.status} />
        {o.outstanding_amount > 0 && <span className="badge badge-warn ml-1.5">เก็บเงิน</span>}
      </td>
      <td className="tnum">{o.paper_box_count + o.foam_box_count + o.piece_count}</td>
      <td className="whitespace-nowrap">{o.boat_id ?? '—'}</td>
      <td>{o.packer_name || '—'}</td>
      <td>{o.pier_name || '—'}</td>
    </tr>
  )
}
