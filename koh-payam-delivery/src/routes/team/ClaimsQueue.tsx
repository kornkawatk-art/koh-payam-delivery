import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listClaims, countOutstandingClaims, type ClaimRow } from '../../lib/api/claims'
import { listUnmatchedBackorders, type UnmatchedBackorderRow } from '../../lib/api/backorders'
import { Flag } from '@phosphor-icons/react'
import { Spinner } from '../../components/ui/Spinner'
import { PageHeader } from '../../components/ui/PageHeader'
import { formatDateTimeTH } from '../../lib/format'

type Filter = 'all' | 'open' | 'approved' | 'rejected'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'open', label: 'เปิด' },
  { key: 'approved', label: 'อนุมัติ' },
  { key: 'rejected', label: 'ปฏิเสธ' },
]

const STATUS_TONE: Record<string, string> = {
  open: 'badge-warn',
  approved: 'badge-ok',
  rejected: 'badge-neutral',
  closed: 'badge-neutral',
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export default function ClaimsQueue() {
  const [filter, setFilter] = useState<Filter>('all')
  const [rows, setRows] = useState<ClaimRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setRows(null)
    setFailed(false)
    // "อนุมัติ" also matches claims that have since auto-closed (refund closed
    // instantly, or a resend_next_day claim's compensating shipment was fully
    // delivered) -- a manager browsing this tab still sees the claim's full
    // history in one place. "เปิด"/"ปฏิเสธ"/"ทั้งหมด" are unaffected.
    const params =
      filter === 'all' ? {} : { status: filter === 'approved' ? ['approved', 'closed'] : filter }
    listClaims(params)
      .then((r) => {
        if (active) setRows(r)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [filter])

  // Outstanding-claims count loads independently of the claims queue and the
  // unmatched-backorders section: a failure here must not blank either of
  // those (same cross-section failure isolation as the two effects above).
  const [outstandingCount, setOutstandingCount] = useState<number | null>(null)
  const [outstandingFailed, setOutstandingFailed] = useState(false)

  useEffect(() => {
    let active = true
    countOutstandingClaims()
      .then((n) => {
        if (active) setOutstandingCount(n)
      })
      .catch(() => {
        if (active) setOutstandingFailed(true)
      })
    return () => {
      active = false
    }
  }, [])

  // Unmatched backorders load independently of the claims queue above: a
  // failure here must never blank the already-loaded claims table (and vice
  // versa), same as ClaimDetail.tsx keeps its claim and evidence-photos
  // fetches from stepping on each other.
  const [backorders, setBackorders] = useState<UnmatchedBackorderRow[] | null>(null)
  const [backordersFailed, setBackordersFailed] = useState(false)

  useEffect(() => {
    let active = true
    listUnmatchedBackorders()
      .then((r) => {
        if (active) setBackorders(r)
      })
      .catch(() => {
        if (active) setBackordersFailed(true)
      })
    return () => {
      active = false
    }
  }, [])

  const now = Date.now()

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="คิวเคลม" icon={Flag} accent="rose" />

      {outstandingFailed ? (
        <p className="alert alert-danger">โหลดจำนวนเคลมค้างอยู่ไม่สำเร็จ</p>
      ) : outstandingCount !== null ? (
        <p className="inline-flex w-fit items-center gap-2 rounded-lg border border-accent-rose/25 bg-accent-rose-soft px-3 py-2 font-semibold text-accent-rose">
          <Flag size={16} weight="fill" aria-hidden="true" />
          ค้างอยู่ {outstandingCount} รายการ
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={
              'btn btn-sm ' + (filter === f.key ? 'btn-primary' : 'btn-secondary')
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {failed ? (
        <p className="alert alert-danger">โหลดคิวเคลมไม่สำเร็จ</p>
      ) : !rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="muted">ไม่มีเคลม</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>เลขออเดอร์</th>
                <th>ลูกค้า</th>
                <th>ประเภท</th>
                <th>จำนวนรายการ</th>
                <th>สถานะ</th>
                <th>กำหนดเส้นตาย</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const overdue =
                  c.status === 'open' && new Date(c.deadline_at).getTime() < now
                return (
                  <tr key={c.id} className={overdue ? 'bg-red-50' : undefined}>
                    <td className="whitespace-nowrap">
                      <Link className="link" to={`/claims/${c.id}`}>
                        {c.makro_order_no}
                      </Link>
                    </td>
                    <td>{c.customer_name_en}</td>
                    <td>{c.type}</td>
                    <td className="tnum">{c.itemCount} รายการ</td>
                    <td>
                      <span className={'badge ' + (STATUS_TONE[c.status] ?? 'badge-neutral')}>
                        {c.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">{formatDateTimeTH(c.deadline_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <p className="section-title">ค้างส่งจากเคลมที่ยังจับคู่ไม่สำเร็จ</p>
        {backordersFailed ? (
          <p className="alert alert-danger">โหลดรายการค้างส่งที่ยังจับคู่ไม่สำเร็จ</p>
        ) : !backorders ? (
          <Spinner />
        ) : backorders.length === 0 ? (
          <p className="muted">ไม่มีรายการค้างส่งที่ยังจับคู่ไม่สำเร็จ</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ลูกค้า</th>
                  <th>สินค้า</th>
                  <th>ค้างมาแล้ว</th>
                </tr>
              </thead>
              <tbody>
                {backorders.map((b) => {
                  const daysWaiting = Math.floor((now - new Date(b.createdAt).getTime()) / MS_PER_DAY)
                  const stale = daysWaiting > 7
                  return (
                    <tr key={b.id} className={stale ? 'bg-red-50' : undefined}>
                      <td>{b.customerName}</td>
                      <td>
                        {b.productName} x{b.qty}
                      </td>
                      <td className="tnum">{daysWaiting} วัน</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
