import { render, screen } from '@testing-library/react'
import { CreditSummaryTable } from './CreditSummaryTable'
import { formatTHB } from '../lib/format'
import type { CreditSummary } from '../lib/credit'

const summary: CreditSummary = {
  orderValue: 1000,
  shortageValue: 120,
  approvedRefund: 80,
  netPayable: 800,
}

test('renders all four Thai rows with their formatted amounts', () => {
  render(<CreditSummaryTable summary={summary} lang="th" />)
  for (const label of [
    'มูลค่าออเดอร์',
    'หัก ของขาด',
    'หัก เงินคืนที่อนุมัติ',
    'ยอดที่ต้องชำระสุทธิ',
  ]) {
    expect(screen.getByText(label)).toBeInTheDocument()
  }
  for (const value of [1000, 120, 80, 800]) {
    expect(screen.getByText(formatTHB(value))).toBeInTheDocument()
  }
})

test('defaults to Thai labels when no lang prop is given', () => {
  render(<CreditSummaryTable summary={summary} />)
  expect(screen.getByText('ยอดที่ต้องชำระสุทธิ')).toBeInTheDocument()
  expect(screen.queryByText('Net payable')).not.toBeInTheDocument()
})
