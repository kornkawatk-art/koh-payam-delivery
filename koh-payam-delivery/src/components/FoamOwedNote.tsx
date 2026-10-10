import { useEffect, useState } from 'react'
import { getCustomerFoamBalance } from '../lib/api/foamBoxes'
import type { CustomerRef } from '../lib/api/customerAliases'

/** Pier pages: "this customer holds N foam boxes -- ask the boat crew to collect". */
export function FoamOwedNote({ customer }: { customer: CustomerRef }) {
  const [n, setN] = useState(0)
  const { customer_phone, customer_name_en } = customer
  useEffect(() => {
    let live = true
    getCustomerFoamBalance({ customer_phone, customer_name_en }).then((v) => {
      if (live) setN(v)
    })
    return () => {
      live = false
    }
  }, [customer_phone, customer_name_en])
  if (n <= 0) return null
  return <p className="alert alert-info">ลูกค้ารายนี้ค้างลังโฟม {n} ใบ — ฝากคนเรือทวงคืน</p>
}
