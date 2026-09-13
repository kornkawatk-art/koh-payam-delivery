import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listLineContacts,
  listPendingLineContactRequests,
  resolveLineContactRequest,
  type LineContactRow,
  type PendingLineContactRow,
} from '../../lib/api/lineContacts'
import { Spinner } from '../../components/ui/Spinner'
import { PageHeader } from '../../components/ui/PageHeader'
import { formatDateTimeTH } from '../../lib/format'

export default function LineContacts() {
  const [rows, setRows] = useState<LineContactRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')

  const [pending, setPending] = useState<PendingLineContactRow[]>([])
  const [pendingFailed, setPendingFailed] = useState(false)
  // Every phone currently mid-decision. A Set (rather than a single scalar)
  // so approving/rejecting one row's request doesn't affect another row's
  // disabled state -- each row only cares whether ITS OWN phone is in here.
  const [busyPhones, setBusyPhones] = useState<Set<string>>(new Set())
  const [pendingError, setPendingError] = useState('')

  const load = useCallback(() => {
    return listLineContacts()
      .then((r) => setRows(r))
      .then(() => setFailed(false))
      .catch(() => setFailed(true))
  }, [])

  const loadPending = useCallback(() => {
    return listPendingLineContactRequests()
      .then((p) => {
        setPending(p)
        setPendingFailed(false)
      })
      .catch(() => setPendingFailed(true))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadPending()
  }, [loadPending])

  async function decide(phone: string, decision: 'approve' | 'reject') {
    setBusyPhones((prev) => new Set(prev).add(phone))
    setPendingError('')
    try {
      await resolveLineContactRequest(phone, decision)
      await Promise.all([load(), loadPending()])
    } catch (e) {
      setPendingError((e as Error).message)
    } finally {
      setBusyPhones((prev) => {
        const next = new Set(prev)
        next.delete(phone)
        return next
      })
    }
  }

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

      {(pending.length > 0 || pendingFailed) && (
        <section className="flex flex-col gap-2">
          <p className="section-title">คำขอรออนุมัติ</p>
          {pendingFailed && (
            <p className="alert alert-danger">โหลดคำขอรออนุมัติไม่สำเร็จ</p>
          )}
          {pendingError && <p className="alert alert-danger">{pendingError}</p>}
          {!pendingFailed && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>เบอร์โทร</th>
                  <th>ชื่อ LINE เดิม</th>
                  <th>ชื่อ LINE ใหม่</th>
                  <th>วันที่ขอ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.phone}>
                    <td className="whitespace-nowrap">{p.phone}</td>
                    <td>{p.oldDisplayName || '—'}</td>
                    <td>{p.pendingDisplayName || '—'}</td>
                    <td className="whitespace-nowrap">{formatDateTimeTH(p.requestedAt)}</td>
                    <td className="whitespace-nowrap">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyPhones.has(p.phone)}
                          onClick={() => void decide(p.phone, 'approve')}
                        >
                          อนุมัติ
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={busyPhones.has(p.phone)}
                          onClick={() => void decide(p.phone, 'reject')}
                        >
                          ปฏิเสธ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </section>
      )}

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
