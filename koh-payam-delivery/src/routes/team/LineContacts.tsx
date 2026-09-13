import { useEffect, useMemo, useState } from 'react'
import { listLineContacts, type LineContactRow } from '../../lib/api/lineContacts'
import { Spinner } from '../../components/ui/Spinner'
import { PageHeader } from '../../components/ui/PageHeader'
import { formatDateTimeTH } from '../../lib/format'

export default function LineContacts() {
  const [rows, setRows] = useState<LineContactRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    let active = true
    listLineContacts()
      .then((r) => {
        if (active) setRows(r)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    const r = rows ?? []
    const s = q.trim().toLowerCase()
    return s
      ? r.filter(
          (c) =>
            c.phone.toLowerCase().includes(s) ||
            (c.displayName ?? '').toLowerCase().includes(s),
        )
      : r
  }, [rows, q])

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="ผู้ลงทะเบียน LINE" />

      <input
        placeholder="ค้นหาเบอร์โทร / ชื่อ LINE"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {failed ? (
        <p className="alert alert-danger">โหลดรายชื่อผู้ลงทะเบียน LINE ไม่สำเร็จ</p>
      ) : !rows ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <p className="muted">ยังไม่มีลูกค้าลงทะเบียน</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>เบอร์โทร</th>
                <th>ชื่อ LINE</th>
                <th>วันที่ลงทะเบียน</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.phone}>
                  <td className="whitespace-nowrap">{c.phone}</td>
                  <td>{c.displayName || '—'}</td>
                  <td className="whitespace-nowrap">{formatDateTimeTH(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
