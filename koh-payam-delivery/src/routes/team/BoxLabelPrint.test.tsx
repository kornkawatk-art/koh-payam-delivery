import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import BoxLabelPrint from './BoxLabelPrint'

const markBoxLabelPacked = vi.fn().mockResolvedValue(undefined)
let rows: unknown[] = []
vi.mock('../../lib/api/boxLabels', () => ({
  listBoxLabelsForDay: () => Promise.resolve(rows),
  markBoxLabelPacked: (...a: unknown[]) => markBoxLabelPacked(...a),
}))
vi.mock('../../lib/format', async (orig) => ({ ...(await orig<typeof import('../../lib/format')>()), todayLocalISO: () => '2026-11-04' }))
const printSpy = vi.fn()

beforeEach(() => {
  printSpy.mockReset()
  window.print = printSpy
  markBoxLabelPacked.mockClear()
  rows = [
    { makro_order_no: '8545090248A', label: 'ครูวิทย์', note: 'วางบนสุด', customer_name: 'MYAWADDY TRADING', ship_date: '2026-11-04',
      paper_box_count: null, foam_box_count: null, piece_count: null, packed_at: null, packed_by_name: null },
    { makro_order_no: '8545000001A', label: 'ร้านป้าแดง', note: null, customer_name: 'DAENG', ship_date: '2026-11-04',
      paper_box_count: 2, foam_box_count: 0, piece_count: 0, packed_at: '2026-11-04T07:20:00Z', packed_by_name: 'สมชาย' },
  ]
})
afterEach(() => document.body.classList.remove('printing-stickers'))

const open = () => render(<MemoryRouter><BoxLabelPrint /></MemoryRouter>)

test('each PO of the day shows the name sale gave its boxes, in large type, with the note', async () => {
  open()
  const card = await screen.findByRole('article', { name: /8545090248A/ })
  expect(within(card).getByText('ครูวิทย์')).toHaveClass('text-2xl')
  expect(card).toHaveTextContent('MYAWADDY TRADING')
  expect(card).toHaveTextContent('วางบนสุด')
})

test('the packer enters the boxes, which are saved for sale, then one sticker per box prints with the name and the PO', async () => {
  open()
  const card = await screen.findByRole('article', { name: /8545090248A/ })
  await userEvent.type(within(card).getByLabelText('ลังกระดาษ'), '2')
  await userEvent.type(within(card).getByLabelText('ลังโฟม'), '1')
  await userEvent.click(within(card).getByRole('button', { name: 'พิมพ์สติ๊กเกอร์ (3 ดวง)' }))
  expect(markBoxLabelPacked).toHaveBeenCalledWith('8545090248A', { paper: 2, foam: 1, piece: 0 })
  await waitFor(() => expect(printSpy).toHaveBeenCalled())
  const faces = screen.getByTestId('sticker-print-root').querySelectorAll('.sticker')
  expect(faces).toHaveLength(3)
  expect(faces[0]).toHaveTextContent('ครูวิทย์')
  expect(faces[0]).toHaveTextContent('1 / 3')
  expect(faces[2]).toHaveTextContent('ลังโฟม')
  expect(faces[0]).toHaveTextContent('8545090248A')
})

test('a PO already printed shows its count and who packed it, and can print again', async () => {
  open()
  const card = await screen.findByRole('article', { name: /8545000001A/ })
  expect(card).toHaveTextContent('พิมพ์แล้ว 2 ลัง · สมชาย')
  expect(within(card).getByLabelText('ลังกระดาษ')).toHaveValue('2')
  expect(within(card).getByRole('button', { name: 'พิมพ์สติ๊กเกอร์ (2 ดวง)' })).toBeEnabled()
})
