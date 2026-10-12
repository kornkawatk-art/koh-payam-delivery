import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentRefreshCard } from './PaymentRefreshCard'
import { DEFAULT_ORDER_MAPPING } from '../lib/import/buildImport'

const parseMakroFile = vi.fn()
const refreshPayments = vi.fn()
vi.mock('../lib/import/parseMakroFile', () => ({ parseMakroFile: (...a: unknown[]) => parseMakroFile(...a) }))
vi.mock('../lib/api/paymentRefresh', () => ({ refreshPayments: (...a: unknown[]) => refreshPayments(...a) }))

test('uploads only an OrderExport and reports what was refreshed', async () => {
  const O = DEFAULT_ORDER_MAPPING
  parseMakroFile.mockResolvedValue([{ [O.orderNo]: 'P-1', [O.paymentStatus]: 'Paid', [O.outstandingAmount]: '0' }])
  refreshPayments.mockResolvedValue({ refreshed: 1, notInApp: ['P-9'] })
  render(<PaymentRefreshCard orderMapping={O} />)
  const file = new File(['x'], 'OrderExport.xlsx')
  await userEvent.upload(screen.getByLabelText('ไฟล์ OrderExport (ย้อนหลังหลายวันได้)'), file)
  await userEvent.click(await screen.findByRole('button', { name: 'อัปเดตสถานะการจ่ายเงิน' }))
  expect(
    await screen.findByText('อัปเดตสถานะการจ่ายเงิน 1 ออเดอร์ · ไม่พบในแอป 1 ออเดอร์ (ข้าม)'),
  ).toBeInTheDocument()
})
