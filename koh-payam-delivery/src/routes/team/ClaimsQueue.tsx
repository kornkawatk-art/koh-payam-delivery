import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listClaims, type ClaimRow } from '../../lib/api/claims'
import { Spinner } from '../../components/ui/Spinner'
import { formatDateTimeTH } from '../../lib/format'

type Filter = 'all' | 'open' | 'approved' | 'rejected'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'open', label: 'เปิด' },
  { key: 'approved', label: 'อนุมัติ' },
  { key: 'rejected', label: 'ปฏิเสธ' },
]

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
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">คิวเคลม</h1>
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={
              'rounded border px-3 py-1 text-sm ' +
              (filter === f.key ? 'bg-black text-white' : '')
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {failed ? (
        <p className="text-sm text-red-600">โหลดคิวเคลมไม่สำเร็จ</p>
      ) : !rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">ไม่มีเคลม</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
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
                <tr key={c.id} className={'border-t ' + (overdue ? 'bg-red-50' : '')}>
                  <td>
                    <Link className="underline" to={`/claims/${c.id}`}>
                      {c.makro_order_no}
                    </Link>
                  </td>
                  <td>{c.customer_name_en}</td>
                  <td>{c.type}</td>
                  <td>{c.qty}</td>
                  <td>{c.status}</td>
                  <td>{formatDateTimeTH(c.deadline_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
