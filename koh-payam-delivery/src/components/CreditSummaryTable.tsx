import type { CreditSummary } from '../lib/credit'
import { formatTHB } from '../lib/format'

const LABELS = {
  th: {
    orderValue: 'มูลค่าออเดอร์',
    shortageValue: 'หัก ของขาด',
    approvedRefund: 'หัก เงินคืนที่อนุมัติ',
    netPayable: 'ยอดที่ต้องชำระสุทธิ',
  },
  en: {
    orderValue: 'Order value',
    shortageValue: 'Less shortage',
    approvedRefund: 'Less approved refunds',
    netPayable: 'Net payable',
  },
}

export function CreditSummaryTable({
  summary,
  lang = 'th',
}: {
  summary: CreditSummary
  lang?: 'th' | 'en'
}) {
  const t = LABELS[lang]
  const rows: [string, number][] = [
    [t.orderValue, summary.orderValue],
    [t.shortageValue, summary.shortageValue],
    [t.approvedRefund, summary.approvedRefund],
    [t.netPayable, summary.netPayable],
  ]
  return (
    <table className="w-full max-w-sm text-sm">
      <tbody>
        {rows.map(([label, value], i) => (
          <tr key={label} className={i === rows.length - 1 ? 'border-t font-semibold' : ''}>
            <td className="py-0.5">{label}</td>
            <td className="py-0.5 text-right">{formatTHB(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
