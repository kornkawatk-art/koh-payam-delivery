import { useEffect, useState } from 'react'
import { getCustomerLock } from '../lib/api/payments'
import type { Lock } from '../lib/payments'
import type { CustomerRef } from '../lib/api/customerAliases'

/**
 * This customer's payment lock for one delivery (pack / pier pages). null
 * until known; a failed lookup resolves unlocked (getCustomerLock fails soft).
 */
export function usePaymentLock(ref: CustomerRef | null | undefined, shipDate: string | null | undefined): Lock | null {
  const [lock, setLock] = useState<Lock | null>(null)
  const phone = ref?.customer_phone ?? null
  const name = ref?.customer_name_en ?? null
  useEffect(() => {
    setLock(null)
    if (!shipDate || (!phone && !name)) return
    let live = true
    getCustomerLock({ customer_phone: phone, customer_name_en: name }, shipDate).then((l) => {
      if (live) setLock(l)
    })
    return () => {
      live = false
    }
  }, [phone, name, shipDate])
  return lock
}

/** Red "owes an earlier bill -- don't pack or ship" note. */
export function PaymentLockNote({ lock }: { lock: Lock | null }) {
  if (!lock?.locked) return null
  return (
    <p className="alert alert-danger font-semibold" role="alert">
      ค้างชำระ {lock.priorBills.length} บิล · {lock.oldestDays} วัน — ห้ามแพ็ค/ส่ง จนกว่าจะจ่าย หรือหัวหน้าปลดให้
    </p>
  )
}
