import { render, screen } from '@testing-library/react'
import { FoamOwedNote } from './FoamOwedNote'

const getCustomerFoamBalance = vi.fn()
vi.mock('../lib/api/foamBoxes', () => ({
  getCustomerFoamBalance: (...a: unknown[]) => getCustomerFoamBalance(...a),
}))
const customer = { customer_phone: '0826289533', customer_name_en: 'JJ Payam' }

test('shows the reminder when the customer holds boxes', async () => {
  getCustomerFoamBalance.mockResolvedValue(4)
  render(<FoamOwedNote customer={customer} />)
  expect(await screen.findByText('ลูกค้ารายนี้ค้างลังโฟม 4 ใบ — ฝากคนเรือทวงคืน')).toBeInTheDocument()
  expect(getCustomerFoamBalance).toHaveBeenCalledWith(customer)
})

test('renders nothing at 0 (also what a not-yet-enabled system returns)', async () => {
  getCustomerFoamBalance.mockResolvedValue(0)
  const { container } = render(<FoamOwedNote customer={customer} />)
  await new Promise((r) => setTimeout(r, 0))
  expect(container).toBeEmptyDOMElement()
})
