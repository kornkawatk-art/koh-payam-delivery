import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BulkStickerDialog } from './BulkStickerPrint'
import type { StickerJob } from '../lib/bulkStickers'

const { getShortNames, saveShortName, markStickersPrinted } = vi.hoisted(() => ({
  getShortNames: vi.fn(),
  saveShortName: vi.fn(),
  markStickersPrinted: vi.fn(),
}))
vi.mock('../lib/api/customerAliases', async (orig) => ({
  ...(await orig<typeof import('../lib/api/customerAliases')>()),
  getShortNames,
  saveShortName,
}))
vi.mock('../lib/api/stickerPrints', () => ({ markStickersPrinted }))

const order = (id: string, p: number, f: number) => ({
  id,
  makro_order_no: 'PO-' + id,
  customer_name_en: 'x',
  customer_phone: null,
  status: 'packed',
  paper_box_count: p,
  foam_box_count: f,
  piece_count: 0,
})
const job = (key: string, name: string, printed: boolean, p = 1, f = 1): StickerJob => ({
  key,
  name,
  phone: key === 'phone:0826289533|name:JJ PAYAM' ? '0826289533' : null,
  island: 'payam',
  counts: { paper: p, foam: f, piece: 0 },
  orders: [order(key, p, f)],
  printed,
})
const jobs = [
  job('phone:0826289533|name:JJ PAYAM', 'JJ Payam', false, 2, 1),
  job('name:SUNSET BAR', 'Sunset Bar', false, 1, 0),
  job('name:OLD SHOP', 'Old Shop', true, 1, 0),
]
const printSpy = vi.fn()

beforeEach(() => {
  getShortNames.mockReset().mockResolvedValue(new Map([['phone:0826289533|name:JJ PAYAM', 'JJ']]))
  saveShortName.mockReset().mockResolvedValue(undefined)
  markStickersPrinted.mockReset().mockResolvedValue(undefined)
  printSpy.mockReset()
  window.print = printSpy
})
afterEach(() => document.body.classList.remove('printing-stickers'))

const open = () => render(<BulkStickerDialog jobs={jobs} onClose={vi.fn()} onPrinted={vi.fn()} />)

test('not-yet-printed customers are ticked; printed ones sit unticked below for a reprint', async () => {
  open()
  const dlg = screen.getByRole('dialog', { name: 'พิมพ์สติ๊กเกอร์ทั้งหมด' })
  expect(await within(dlg).findByDisplayValue('JJ')).toBeInTheDocument()
  expect(within(dlg).getByRole('checkbox', { name: 'JJ Payam' })).toBeChecked()
  expect(within(dlg).getByRole('checkbox', { name: 'Sunset Bar' })).toBeChecked()
  expect(within(dlg).getByRole('checkbox', { name: 'Old Shop' })).not.toBeChecked()
  expect(within(dlg).getByRole('button', { name: 'พิมพ์ 4 ดวง' })).toBeEnabled()
})

test('a guessed short name is flagged and can be corrected before printing', async () => {
  open()
  const guessed = await screen.findByDisplayValue('Sunset')
  expect(screen.getAllByText('ชื่อที่ระบบเดา')).toHaveLength(2) // Sunset Bar + Old Shop
  await userEvent.clear(guessed)
  await userEvent.type(guessed, 'SB')
  await userEvent.click(screen.getByRole('button', { name: 'พิมพ์ 4 ดวง' }))
  await waitFor(() => expect(printSpy).toHaveBeenCalled())
  expect(saveShortName).toHaveBeenCalledWith({ customer_phone: null, customer_name_en: 'Sunset Bar' }, 'SB')
  expect(saveShortName).toHaveBeenCalledWith({ customer_phone: '0826289533', customer_name_en: 'JJ Payam' }, 'JJ')
})

test('prints every ticked customer’s stickers, numbered per customer, and records them as printed', async () => {
  open()
  await screen.findByDisplayValue('JJ')
  await userEvent.click(screen.getByRole('button', { name: 'พิมพ์ 4 ดวง' }))
  const root = await screen.findByTestId('sticker-print-root')
  expect(within(root).getAllByText('JJ')).toHaveLength(3)
  expect(within(root).getByText('Sunset')).toBeInTheDocument()
  expect(root).toHaveTextContent('3 / 3')
  expect(root).toHaveTextContent('1 / 1')
  await waitFor(() => expect(markStickersPrinted).toHaveBeenCalled())
  expect(markStickersPrinted.mock.calls[0][0].map((o: { id: string }) => o.id)).toEqual([
    'phone:0826289533|name:JJ PAYAM',
    'name:SUNSET BAR',
  ])
})

test('ticking a printed customer adds a reprint', async () => {
  open()
  await screen.findByDisplayValue('JJ')
  await userEvent.click(screen.getByRole('checkbox', { name: 'Old Shop' }))
  expect(screen.getByRole('button', { name: 'พิมพ์ 5 ดวง' })).toBeInTheDocument()
})
