import { useCallback, useEffect, useState } from 'react'
import { listAuditLogs, type AuditLogRow } from '../../lib/api/auditLogs'
import { ClockCounterClockwise } from '@phosphor-icons/react'
import { SkeletonRows } from '../../components/ui/Skeleton'
import { PageHeader } from '../../components/ui/PageHeader'
import { formatDateTimeTH } from '../../lib/format'
import { EmptyState } from '../../components/ui/EmptyState'

export default function AuditLog() {
  const [rows, setRows] = useState<AuditLogRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    return listAuditLogs()
      .then((r) => {
        setRows(r)
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="ประวัติการใช้งาน" icon={ClockCounterClockwise} accent="slate" />

      {failed ? (
        <p className="alert alert-danger">โหลดประวัติการใช้งานไม่สำเร็จ</p>
      ) : !rows ? (
        <SkeletonRows />
      ) : rows.length === 0 ? (
        <EmptyState icon={ClockCounterClockwise} title="ยังไม่มีประวัติการใช้งาน" />
      ) : (
        <div className="table-wrap">
          <table className="data-table stack-table">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>เหตุการณ์</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-xs text-ink-faint">
                    {formatDateTimeTH(r.createdAt)}
                  </td>
                  <td>{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
