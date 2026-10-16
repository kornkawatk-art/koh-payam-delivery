import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  listOrdersForDay,
  getShipDayLinksSentAt,
  sendOrderLinks,
  type UnreachedCustomer,
} from '../../lib/api/shipDays'
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
  ListBullets,
  Printer,
} from '@phosphor-icons/react'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { PageSkeleton } from '../../components/ui/Skeleton'
import { PageHeader } from '../../components/ui/PageHeader'
import QrOrderScanner from '../../components/QrOrderScanner'
import { todayLocalISO } from '../../lib/format'
import { groupByPhone, entryOrders, entryHasUnpacked, type DayEntry } from '../../lib/groupOrders'
import { EmptyState } from '../../components/ui/EmptyState'
import {
  IslandBadge,
  IslandFilter,
  matchesIsland,
  needsIslandFilter,
  type IslandFilterValue,
} from '../../components/ui/Island'
import { PickupBadge } from '../../components/ui/PickupBadge'
import { LinkSendReport } from '../../components/LinkSendReport'
import { MakroVoidBadge } from '../../components/ui/MakroVoidBadge'
import { MakroPickBadge } from '../../components/ui/MakroPickBadge'
import { makroPickStage } from '../../lib/makroStatus'
import { BulkStickerDialog } from '../../components/BulkStickerPrint'
import { buildStickerJobs } from '../../lib/bulkStickers'
import { useAuth } from '../../lib/auth'
import { canEdit, isLead } from '../../lib/roles'
import { getDayLocks, releaseCustomer } from '../../lib/api/payments'
import type { Lock } from '../../lib/payments'
import { customerKey } from '../../../supabase/functions/_shared/customerKey'

export default function DailyDashboard() {
  const { profile } = useAuth()
  // releasing a payment lock: the manager or the online team
  const isManager = isLead(profile?.role)
  // sale reads only: no LINE links, sticker printing or packing from here
  const editable = canEdit(profile?.role ?? 'packer')
  const navigate = useNavigate()
  const [date, setDate] = useState(todayLocalISO())
  const [rows, setRows] = useState<any[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')
  const [island, setIsland] = useState<IslandFilterValue>('all')
  const [scanOpen, setScanOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  // payment lock: customers owing a bill from an earlier delivery (spec 2026-10-12)
  const [locks, setLocks] = useState<Map<string, Lock>>(new Map())
  const [lockTick, setLockTick] = useState(0)
  const [bulkMsg, setBulkMsg] = useState<string>()
  // undefined = not loaded yet (don't flash the banner while unknown)
  const [linksSentAt, setLinksSentAt] = useState<string | null | undefined>(undefined)
  const [linkSendBusy, setLinkSendBusy] = useState(false)
  const [linkSendMsg, setLinkSendMsg] = useState<string>()
  const [unreached, setUnreached] = useState<UnreachedCustomer[]>([])

  const load = useCallback(async () => {
    // A date picker being cleared/edited passes through '' -- don't query
    // (or create a ship day) for a blank date; keep what's on screen.
    if (!date) return
    setFailed(false)
    try {
      setRows(await listOrdersForDay(date))
    } catch {
      setFailed(true)
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
      const r = await sendOrderLinks(date)
      setLinkSendMsg(
        (r.skipped ? 'ส่งลิงก์ไลน์ไปแล้วก่อนหน้านี้' : `ส่งลิงก์ไลน์ ${r.sent} ฉบับ`) +
          (r.unreached.length ? ` · ยังไม่ได้รับ ${r.unreached.length} ราย` : ''),
      )
      setUnreached(r.unreached)
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

  // The tiles track the boat run only; store pickups never reach the pier,
  // so they get their own line instead of holding the tiles short forever.
  const counts = useMemo(() => {
    const r = (rows ?? []).filter((o) => !o.is_pickup)
    const pickups = (rows ?? []).filter((o) => o.is_pickup)
    return {
      total: r.length,
      packed: r.filter((o) => ['packed', 'at_pier', 'shipped'].includes(o.status)).length,
      atPier: r.filter((o) => ['at_pier', 'shipped'].includes(o.status)).length,
      shipped: r.filter((o) => o.status === 'shipped').length,
      pickups: pickups.length,
      pickedUp: pickups.filter((o) => o.status === 'picked_up').length,
    }
  }, [rows])

  // One entry per customer: POs sharing a phone on this day collapse into a
  // group row (see groupByPhone). Grouped from ALL rows -- the search box then
  // keeps any entry with a matching PO, so a group never loses members to it.
  const entries = useMemo(() => groupByPhone<any>(rows ?? []), [rows])

  // "พิมพ์สติ๊กเกอร์ทั้งหมด": per-customer jobs; the button counts what's still due
  const stickerJobs = useMemo(() => buildStickerJobs(rows ?? []), [rows])
  const due = stickerJobs.filter((j) => !j.printed)
  const dueStickers = due.reduce((n, j) => n + j.counts.paper + j.counts.foam + j.counts.piece, 0)

  const showIslandFilter = useMemo(
    () => needsIslandFilter((rows ?? []).map((o) => o.island)),
    [rows],
  )

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return entries.filter(
      (e) =>
        entryOrders(e).some((o) => matchesIsland(o.island, island)) &&
        (!s ||
          entryOrders(e).some(
            (o) =>
              o.customer_name_en.toLowerCase().includes(s) ||
              o.makro_order_no.toLowerCase().includes(s),
          )),
    )
  }, [entries, q, island])

  // Not-yet-packed entries float to the top so the packing queue for the day
  // is obvious at a glance; everything past "packed" (packed/at_pier/shipped
  // -- same grouping as the counts.packed tile above) sinks below a divider.
  // A customer group stays on top while any of its POs is still just imported.
  useEffect(() => {
    if (!rows?.length) {
      setLocks(new Map())
      return
    }
    let live = true
    getDayLocks(date, rows)
      .then((m) => live && setLocks(m))
      .catch(() => live && setLocks(new Map())) // fail soft: show nothing locked
    return () => {
      live = false
    }
  }, [rows, date, lockTick])
  const lockOf = (e: DayEntry<any>) => locks.get(customerKey(entryOrders(e)[0]))

  // A customer whose every PO is a store pickup gets its own section at the end.
  const isPickupEntry = (e: DayEntry<any>) => entryOrders(e).every((o) => o.is_pickup)
  const boatEntries = useMemo(() => filtered.filter((e) => !isPickupEntry(e)), [filtered])
  const pickupEntries = useMemo(() => filtered.filter(isPickupEntry), [filtered])
  const lockedEntries = boatEntries.filter((e) => lockOf(e)?.locked)
  const openEntries = boatEntries.filter((e) => !lockOf(e)?.locked)
  const notPacked = openEntries.filter((e) => entryHasUnpacked(e))
  const packedOrAhead = openEntries.filter((e) => !entryHasUnpacked(e))

  if (failed)
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="alert alert-danger">โหลดงานวันนี้ไม่สำเร็จ</p>
        <button className="btn btn-secondary btn-sm" onClick={() => load()}>
          ลองใหม่
        </button>
      </div>
    )

  // Lines Makro under-shipped on THIS day's orders (not older carry-over --
  // that shows on the order and pack pages of the order it rides with).
  const todayShort = (rows ?? []).flatMap((o: any) =>
    (o.item_statuses ?? [])
      .filter((i: any) => i.status === 'short')
      .map((i: any, n: number) => ({
        key: `${o.id}:${n}`,
        orderId: o.id as string,
        customerName: o.customer_name_en as string,
        productName: i.product_name as string,
        qty:
          Number(i.shortage_qty) > 0
            ? Number(i.shortage_qty)
            : Math.max(0, Number(i.qty_ordered) - Number(i.qty_shipped)),
      })),
  )

  if (!rows) return <PageSkeleton rows={6} />

  return (
    <div className="flex flex-col gap-5">
      {unreached.length > 0 && (
        <LinkSendReport unreached={unreached} onClose={() => setUnreached([])} />
      )}
      <PageHeader
        title="งานวันนี้"
        icon={House}
        actions={
          <input
            type="date"
            className="w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card flex flex-col gap-1 p-3 sm:p-4">
          <span className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
            <ListBullets size={14} className="text-ink-faint" aria-hidden="true" />
            ออเดอร์ทั้งหมด
          </span>
          <span className="num text-2xl font-semibold tracking-tight text-ink">{counts.total}</span>
        </div>
        <ProgressTile
          icon={<Package size={14} className="text-ink-faint" aria-hidden="true" />}
          label="แพ็คแล้ว"
          progressLabel="ความคืบหน้าการแพ็ค"
          done={counts.packed}
          total={counts.total}
          barClass="bg-brand"
        />
        <ProgressTile
          icon={<MapPin size={14} className="text-ink-faint" aria-hidden="true" />}
          label="ถึงท่าเรือ"
          progressLabel="ความคืบหน้าถึงท่าเรือ"
          done={counts.atPier}
          total={counts.total}
          barClass="bg-brand"
        />
        <ProgressTile
          icon={<CheckCircle size={14} weight="fill" className="text-ok" aria-hidden="true" />}
          label="ส่งแล้ว"
          progressLabel="ความคืบหน้าการส่ง"
          done={counts.shipped}
          total={counts.total}
          barClass="bg-ok"
        />
      </div>
      <MakroPickSummary rows={rows} />
      {counts.pickups > 0 && (
        <p className="-mt-2 text-sm text-ink-soft">
          รับเองที่สาขา {counts.pickups} (รับแล้ว {counts.pickedUp})
        </p>
      )}

      {editable && linksSentAt === null && rows.length > 0 && (
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

      {todayShort.length > 0 && (
        <div className="alert alert-warn">
          <p className="flex items-center gap-1.5 font-semibold">
            <Warning size={16} weight="fill" aria-hidden="true" />
            ของขาดวันนี้ {todayShort.length} รายการ
          </p>
          <ul className="mt-1.5 list-disc pl-5">
            {todayShort.map((s) => (
              <li key={s.key}>
                <Link className="link" to={`/order/${s.orderId}`}>
                  {s.productName} x{s.qty}
                </Link>
                <span className="text-sm"> · {s.customerName}</span>
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

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-warn btn-sm"
            disabled={stickerJobs.length === 0}
            onClick={() => {
              setBulkMsg(undefined)
              setBulkOpen(true)
            }}
          >
            <Printer size={16} aria-hidden="true" />
            พิมพ์สติ๊กเกอร์ ({due.length} เจ้า · {dueStickers} ดวง)
          </button>
          {bulkMsg ? (
            <span className="text-xs text-ink-soft">{bulkMsg}</span>
          ) : stickerJobs.length === 0 ? (
            <span className="text-xs text-ink-soft">ยังไม่มีออเดอร์ที่แพ็คเสร็จรอพิมพ์</span>
          ) : (
            due.length === 0 && <span className="text-xs text-ink-soft">พิมพ์ครบทุกเจ้าแล้ว</span>
          )}
        </div>
      )}
      {bulkOpen && (
        <BulkStickerDialog
          jobs={stickerJobs}
          onClose={() => setBulkOpen(false)}
          onPrinted={(warning) => {
            setBulkOpen(false)
            setBulkMsg(warning ?? 'ส่งสติ๊กเกอร์ไปพิมพ์แล้ว')
            load()
          }}
        />
      )}

      {showIslandFilter && <IslandFilter value={island} onChange={setIsland} />}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="ไม่มีออเดอร์"
          hint={
            q.trim()
              ? 'ไม่พบออเดอร์ที่ตรงกับคำค้น ลองค้นด้วยชื่อลูกค้าหรือเลขออเดอร์อื่น'
              : island !== 'all'
              ? 'ไม่มีออเดอร์ของเกาะนี้ในวันที่เลือก'
              : 'ยังไม่มีออเดอร์ของวันที่เลือก — เลือกวันอื่น หรือนำเข้าไฟล์ออเดอร์ของวันนี้'
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table stack-table">
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
              {lockedEntries.length > 0 && (
                <tr className="row-divider">
                  <td colSpan={7} className="bg-danger-soft text-xs font-semibold text-danger-ink">
                    ค้างชำระ — ห้ามแพ็ค ({lockedEntries.length})
                  </td>
                </tr>
              )}
              {lockedEntries.map((e) => (
                <Fragment key={entryKey(e)}>
                  <LockedRow
                    entry={e}
                    lock={lockOf(e)!}
                    date={date}
                    canRelease={isManager}
                    onReleased={() => setLockTick((n) => n + 1)}
                  />
                  <EntryRows entry={e} date={date} showIsland={showIslandFilter} />
                </Fragment>
              ))}
              {notPacked.length > 0 && (
                <tr className="row-divider">
                  <td colSpan={7} className="bg-paper text-xs font-semibold text-ink-soft">
                    ยังไม่แพ็ค ({notPacked.length})
                  </td>
                </tr>
              )}
              {notPacked.map((e) => (
                <EntryRows
                  key={entryKey(e)}
                  entry={e}
                  date={date}
                  showIsland={showIslandFilter}
                  released={!!lockOf(e)?.released}
                />
              ))}
              {packedOrAhead.length > 0 && (
                <tr className="row-divider">
                  <td colSpan={7} className="bg-paper text-xs font-semibold text-ink-soft">
                    แพ็คแล้ว ({packedOrAhead.length})
                  </td>
                </tr>
              )}
              {packedOrAhead.map((e) => (
                <EntryRows
                  key={entryKey(e)}
                  entry={e}
                  date={date}
                  showIsland={showIslandFilter}
                  released={!!lockOf(e)?.released}
                />
              ))}
              {pickupEntries.length > 0 && (
                <tr className="row-divider">
                  <td colSpan={7} className="bg-paper text-xs font-semibold text-ink-soft">
                    รับเองที่สาขา ({pickupEntries.length})
                  </td>
                </tr>
              )}
              {pickupEntries.map((e) => (
                <EntryRows
                  key={entryKey(e)}
                  entry={e}
                  date={date}
                  showIsland={showIslandFilter}
                  released={!!lockOf(e)?.released}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/**
 * A day-progress tile: "done/total" plus a bar, the bar in the same color as
 * the tile's icon so each stage reads as its own track. The value stays the
 * tile's direct child (the tests and screen readers find it there).
 */
/**
 * Makro's picking, for the orders the island team has not packed yet: how many Makro has finished, is
 * picking, or has not started (from the last import of Makro's file).
 */
function MakroPickSummary({ rows }: { rows: any[] }) {
  const open = rows.filter((o) => o.status === 'imported')
  if (open.length === 0) return null
  const n = { ready: 0, picking: 0, waiting: 0 }
  for (const o of open) {
    const s = makroPickStage(o.makro_order_status)
    if (s) n[s]++
  }
  if (n.ready + n.picking + n.waiting === 0) return null
  return (
    <p className="-mt-2 text-sm text-ink-soft" aria-label="การจัดสินค้าของแม็คโคร">
      ยังไม่แพ็ค <span className="num">{open.length}</span> ออเดอร์ ·{' '}
      <span className="font-semibold text-ok-ink">
        แม็คโครจัดเสร็จ <span className="num">{n.ready}</span>
      </span>
      {n.picking > 0 && (
        <>
          {' '}
          · <span className="text-warn-ink">กำลังจัด <span className="num">{n.picking}</span></span>
        </>
      )}
      {n.waiting > 0 && (
        <>
          {' '}
          · ยังไม่เริ่ม <span className="num">{n.waiting}</span>
        </>
      )}
      <span className="block text-xs">ตามไฟล์แม็คโครที่นำเข้าล่าสุด นำเข้าซ้ำเพื่ออัปเดต</span>
    </p>
  )
}

/** A customer's POs not packed yet: how many Makro finished picking, e.g. "แม็คโครจัดเสร็จ 1/2" */
function GroupPickBadge({ orders }: { orders: any[] }) {
  const open = orders.filter((o) => o.status === 'imported' && makroPickStage(o.makro_order_status))
  if (open.length === 0) return null
  const ready = open.filter((o) => makroPickStage(o.makro_order_status) === 'ready').length
  return (
    <span className={`badge ml-1.5 ${ready === open.length ? 'badge-ok' : 'badge-warn'}`}>
      แม็คโครจัดเสร็จ {ready}/{open.length}
    </span>
  )
}

function ProgressTile({
  icon,
  label,
  progressLabel,
  done,
  total,
  barClass,
}: {
  icon: ReactNode
  label: string
  progressLabel: string
  done: number
  total: number
  barClass: string
}) {
  return (
    <div className="card flex flex-col gap-1 p-3 sm:p-4">
      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
        {icon}
        {label}
      </span>
      <span className="num text-2xl font-semibold tracking-tight text-ink">
        {done}/{total}
      </span>
      <span
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label={progressLabel}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <span
          className={`block h-full rounded-full transition-[width] duration-500 ${barClass}`}
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </span>
    </div>
  )
}

function entryKey(e: DayEntry<any>) {
  return e.kind === 'single' ? e.order.id : `g-${e.phone}`
}

const uniq = (xs: (string | null | undefined)[]) =>
  Array.from(new Set(xs.filter((x): x is string => !!x)))

// Island badges only on days that mix islands or have an untagged order --
// on a single-island day they would just repeat on every row.
function EntryRows({
  entry,
  date,
  showIsland,
  released,
}: {
  entry: DayEntry<any>
  date: string
  showIsland: boolean
  released?: boolean
}) {
  if (entry.kind === 'single')
    return <OrderRow order={entry.order} showIsland={showIsland} released={released} />
  return <GroupRows group={entry} date={date} showIsland={showIsland} released={released} />
}

const ReleasedBadge = () => <span className="badge badge-warn ml-1.5">ปลดแล้ว</span>

/** Red line above a locked customer: what they owe, and (manager) the release. */
function LockedRow({
  entry,
  lock,
  date,
  canRelease,
  onReleased,
}: {
  entry: DayEntry<any>
  lock: Lock
  date: string
  canRelease: boolean
  onReleased: () => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const ref = entryOrders(entry)[0]

  async function release() {
    setBusy(true)
    setErr(undefined)
    try {
      await releaseCustomer(ref, date, reason)
      onReleased()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr>
      <td colSpan={7} className="bg-danger-soft/60">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-danger-ink">
            ค้างชำระ {lock.priorBills.length} บิล · {lock.oldestDays} วัน
          </span>
          {canRelease &&
            (!open ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
                ปลดให้แพ็ค
              </button>
            ) : (
              <>
                <input
                  className="min-w-0 flex-1"
                  aria-label="เหตุผลที่ปลด"
                  placeholder="เหตุผล เช่น ลูกค้าโอนแล้ว รอแม็คโครอัปเดต"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || !reason.trim()}
                  onClick={() => void release()}
                >
                  ยืนยันปลด
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
                  ยกเลิก
                </button>
              </>
            ))}
          {err && <span className="text-danger-ink">{err}</span>}
        </div>
      </td>
    </tr>
  )
}

function GroupRows({
  group,
  date,
  showIsland,
  released,
}: {
  group: Extract<DayEntry<any>, { kind: 'group' }>
  date: string
  showIsland: boolean
  released?: boolean
}) {
  const { profile } = useAuth()
  const editable = canEdit(profile?.role ?? 'packer')
  const [open, setOpen] = useState(false)
  const os = group.orders
  const packed = os.filter((o) => o.status !== 'imported').length
  const boats = uniq(os.map((o) => o.boat_id))
  return (
    <>
      <tr className="bg-brand-soft/40">
        <td className="stack-lead whitespace-nowrap">
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
        <td data-label="ลูกค้า">
          <span className="font-medium">{group.name}</span>
          {released && <ReleasedBadge />}
          {showIsland &&
            uniq(os.map((o) => o.island ?? 'none')).map((i) => (
              <IslandBadge key={i} island={i} className="ml-1.5" />
            ))}
          {editable && (
            <Link
              className="btn btn-ok btn-sm ml-2"
              to={`/customer/${date}/${encodeURIComponent(group.phone)}/pack?name=${encodeURIComponent(group.name)}`}
            >
              แพ็ครวม
            </Link>
          )}
        </td>
        <td data-label="สถานะ">
          <span className={`badge ${packed === os.length ? 'badge-ok' : 'badge-neutral'}`}>
            แพ็คแล้ว {packed}/{os.length}
          </span>
          <PickupBadge show={os.some((o) => o.is_pickup)} className="ml-1.5" />
          {os.map((o) => (
            <MakroVoidBadge key={o.id} status={o.makro_order_status} className="ml-1.5" />
          ))}
          <GroupPickBadge orders={os} />
          <ShortBadge count={os.reduce((n, o) => n + shortCount(o), 0)} />
          {os.some((o) => o.outstanding_amount > 0) && (
            <span className="badge badge-warn ml-1.5">เก็บเงิน</span>
          )}
        </td>
        <td data-label="รวม" className="tnum">
          {os.reduce((n, o) => n + o.paper_box_count + o.foam_box_count + o.piece_count, 0)}
        </td>
        <td data-label="เรือ" className="whitespace-nowrap">
          {boats.length ? boats.join(', ') : '—'}
        </td>
        <td data-label="คนแพ็ค">{uniq(os.map((o) => o.packer_name)).join(', ') || '—'}</td>
        <td data-label="คนลงเรือ">{uniq(os.map((o) => o.pier_name)).join(', ') || '—'}</td>
      </tr>
      {open && os.map((o) => <OrderRow key={o.id} order={o} indent showIsland={showIsland} />)}
    </>
  )
}

/** Lines Makro under-shipped on this PO (order_items.status = 'short'). */
const shortCount = (o: any): number =>
  (o.item_statuses ?? []).filter((i: { status: string }) => i.status === 'short').length

// Same red "ขาด" as the pack screen's per-line badge, with the count.
function ShortBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="badge badge-danger ml-1.5" title={`ของขาด ${count} รายการ`}>
      ขาด {count}
    </span>
  )
}

function OrderRow({
  order: o,
  indent,
  showIsland,
  released,
}: {
  order: any
  indent?: boolean
  showIsland: boolean
  released?: boolean
}) {
  return (
    <tr className={indent ? 'row-child' : undefined}>
      <td className={`stack-lead whitespace-nowrap ${indent ? 'pl-8' : ''}`}>
        <Link className="link num" to={`/order/${o.id}`}>
          {o.makro_order_no}
        </Link>
      </td>
      <td data-label="ลูกค้า">
        {o.customer_name_en}
        {released && <ReleasedBadge />}
        {showIsland && <IslandBadge island={o.island} className="ml-1.5" />}
      </td>
      <td data-label="สถานะ">
        <StatusBadge status={o.status} />
        <PickupBadge show={o.is_pickup} className="ml-1.5" />
        <MakroVoidBadge status={o.makro_order_status} className="ml-1.5" />
        <MakroPickBadge status={o.makro_order_status} packStatus={o.status} className="ml-1.5" />
        <ShortBadge count={shortCount(o)} />
        {o.outstanding_amount > 0 && <span className="badge badge-warn ml-1.5">เก็บเงิน</span>}
      </td>
      <td data-label="รวม" className="tnum">
        {o.paper_box_count + o.foam_box_count + o.piece_count}
      </td>
      <td data-label="เรือ" className="whitespace-nowrap">
        {o.boat_id ?? '—'}
      </td>
      <td data-label="คนแพ็ค">{o.packer_name || '—'}</td>
      <td data-label="คนลงเรือ">{o.pier_name || '—'}</td>
    </tr>
  )
}
