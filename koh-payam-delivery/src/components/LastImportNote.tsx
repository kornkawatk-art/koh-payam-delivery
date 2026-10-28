import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClockCounterClockwise, Warning } from '@phosphor-icons/react'
import { getLastImport } from '../lib/api/dataImports'
import { importLateMs } from '../lib/importFreshness'
import { formatDateTimeTH } from '../lib/format'

const HOUR_MS = 3_600_000

/**
 * When the Makro files were last imported, for the people who import them (งานวันนี้).
 * Red once 2 h late within work hours; O2O Desk reminds the team on the same rule.
 * A failed load just hides it.
 */
export function LastImportNote() {
  // undefined = not loaded (or failed): show nothing
  const [asOf, setAsOf] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    getLastImport()
      .then((v) => live && setAsOf(v))
      .catch(() => live && setAsOf(undefined))
    return () => {
      live = false
    }
  }, [])

  if (asOf === undefined) return null
  const late = importLateMs(asOf, Date.now())
  const link = (
    <Link to="/import" className="link font-semibold">
      นำเข้าออเดอร์
    </Link>
  )
  if (late > 0)
    return (
      <p role="alert" className="alert alert-danger flex flex-wrap items-center gap-x-2 gap-y-1">
        <Warning size={18} weight="fill" className="shrink-0" aria-hidden="true" />
        <span className="font-semibold">ข้อมูลแม็คโครไม่ได้อัปเดตเกิน {Math.floor(late / HOUR_MS)} ชม.</span>
        <span>(นำเข้าล่าสุด {formatDateTimeTH(asOf!)})</span>
        {link}
      </p>
    )
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
      <ClockCounterClockwise size={16} className="shrink-0" aria-hidden="true" />
      <span>{asOf ? `ข้อมูลแม็คโครนำเข้าล่าสุด ${formatDateTimeTH(asOf)}` : 'ยังไม่มีประวัติการนำเข้าไฟล์แม็คโคร'}</span>
      {link}
    </p>
  )
}
