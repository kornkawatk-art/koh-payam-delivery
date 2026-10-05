import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Warning, X } from '@phosphor-icons/react'
import type { UnreachedCustomer } from '../lib/api/shipDays'

const REASON: Record<UnreachedCustomer['reason'], string> = {
  not_registered: 'ยังไม่ได้ลงทะเบียน LINE',
  no_phone: 'ไม่มีเบอร์โทรในออเดอร์',
  push_failed: 'ส่งไม่สำเร็จ (อาจบล็อก LINE ร้าน)',
}

/**
 * Popup after "ส่งลิงก์ไลน์": the customers who did NOT get a LINE message,
 * each with links to their orders, where "คัดลอก" copies the link to send
 * by hand.
 */
export function LinkSendReport({
  unreached,
  onClose,
}: {
  unreached: UnreachedCustomer[]
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ลูกค้าที่ยังไม่ได้รับลิงก์ทางไลน์"
    >
      <div className="card flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-b-none sm:rounded-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Warning size={18} weight="fill" className="shrink-0 text-warn" aria-hidden="true" />
            ยังไม่ได้รับลิงก์ทางไลน์ {unreached.length} ราย
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="ปิด" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="text-sm text-ink-soft">
          กดเลข PO เพื่อเปิดออเดอร์ แล้วกด "คัดลอก" ลิงก์ส่งให้ลูกค้าเอง
        </p>
        <ul className="flex flex-col divide-y divide-line text-sm">
          {unreached.map((u, i) => (
            <li key={`${u.phone ?? 'nophone'}-${i}`} className="flex flex-col gap-1 py-2.5">
              <span className="font-medium">{u.customerName}</span>
              <span className="text-xs text-warn-ink">
                {REASON[u.reason]}
                {u.phone ? ` · ${u.phone}` : ''}
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {u.orders.map((o) => (
                  <Link key={o.id} className="link" to={`/order/${o.id}`} onClick={onClose}>
                    {o.makroOrderNo}
                  </Link>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-primary w-full" onClick={onClose}>
          รับทราบ
        </button>
      </div>
    </div>
  )
}
