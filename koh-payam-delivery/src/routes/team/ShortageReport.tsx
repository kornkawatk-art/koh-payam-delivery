import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getShortageReport, type ShortageProductRow } from '../../lib/api/shortageReport'
import { ChartBar } from '@phosphor-icons/react'
import { Spinner } from '../../components/ui/Spinner'
import { PageHeader } from '../../components/ui/PageHeader'
import { formatDateTH } from '../../lib/format'

// Local-date ISO string N days before today -- mirrors format.ts's
// todayLocalISO (calendar-local, not UTC) but for an arbitrary offset.
function daysAgoLocalISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ShortageReport() {
  // Default range: last 30 days, matching the audit log's own retention
  // window -- keeps the page from looking empty on first load.
  const [fromDate, setFromDate] = useState(() => daysAgoLocalISO(30))
  const [toDate, setToDate] = useState(() => daysAgoLocalISO(0))
  const [rows, setRows] = useState<ShortageProductRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [openProduct, setOpenProduct] = useState<string | null>(null)

  const load = useCallback(() => {
    setFailed(false)
    setRows(null)
    return getShortageReport(fromDate, toDate)
      .then((r) => setRows(r))
      .catch(() => setFailed(true))
  }, [fromDate, toDate])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="รายงานของขาด"
        icon={ChartBar}
        accent="violet"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-ink-soft">
              จาก
              <input
                type="date"
                className="w-auto"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-ink-soft">
              ถึง
              <input
                type="date"
                className="w-auto"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </label>
          </div>
        }
      />

      {failed ? (
        <p className="alert alert-danger">โหลดรายงานของขาดไม่สำเร็จ</p>
      ) : !rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="muted">ไม่มีของขาดในช่วงที่เลือก</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((p) => {
            const open = openProduct === p.productName
            return (
              <div key={p.productName} className="card">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() => setOpenProduct(open ? null : p.productName)}
                >
                  <span className="font-semibold text-ink">{p.productName}</span>
                  <span className="flex items-center gap-3 text-sm text-ink-soft">
                    <span className="tnum font-semibold text-ink">{p.totalQty}</span>
                    <span>ขาดจาก {p.orderCount} ออเดอร์</span>
                  </span>
                </button>
                {open && (
                  <div className="table-wrap mt-3">
                    <table className="data-table stack-table">
                      <thead>
                        <tr>
                          <th>เลขออเดอร์</th>
                          <th>ลูกค้า</th>
                          <th>วันที่ส่ง</th>
                          <th>จำนวน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.details.map((d) => (
                          <tr key={d.orderId}>
                            <td className="stack-lead whitespace-nowrap">
                              <Link className="link" to={`/order/${d.orderId}`}>
                                {d.makroOrderNo}
                              </Link>
                            </td>
                            <td data-label="ลูกค้า">{d.customerNameEn}</td>
                            <td data-label="วันที่ส่ง" className="whitespace-nowrap">
                              {formatDateTH(d.shipDate)}
                            </td>
                            <td data-label="จำนวน" className="tnum">
                              {d.qty}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
