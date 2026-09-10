import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listClaims, type ClaimRow } from '../../lib/api/claims'
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

export default function ClaimsQueue() {
  const [filter, setFilter] = useState<Filter>('all')
  const [rows, setRows] = useState<ClaimRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setRows(null)
    setFailed(false)
    listClaims(filter === 'all' ? {} : { status: filter })
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

  const now = Date.now()

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="คิวเคลม" />

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
                <th>จำนวน</th>
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
                    <td className="tnum">{c.qty}</td>
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
    </div>
  )
}
