import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImportOrders from './ImportOrders'

vi.mock('../../lib/import/parseMakroFile', () => ({
  parseMakroFile: vi.fn().mockResolvedValue([
    { 'Order No': 'PO-1', Customer: 'A', Product: 'x', Qty: '2', 'Unit Price': '100' },
  ]),
}))

const commitImport = vi.fn()
vi.mock('../../lib/api/orders', () => ({
  commitImport: (...a: unknown[]) => commitImport(...a),
}))

beforeEach(() => {
  localStorage.clear()
  commitImport.mockReset().mockResolvedValue({ created: 1, overwrites: [] })
})

async function uploadAndPreview() {
  render(<ImportOrders />)
  const file = new File(['dummy'], 'makro.csv', { type: 'text/csv' })
  await userEvent.upload(screen.getByLabelText(/เลือกไฟล์/i), file)
  await userEvent.click(await screen.findByRole('button', { name: /ดูตัวอย่าง/i }))
  expect(await screen.findByText('PO-1')).toBeInTheDocument()
}

test('shows preview after choosing a file and mapping defaults resolve', async () => {
  await uploadAndPreview()
})

test('successful import reports the created count', async () => {
  await uploadAndPreview()
  await userEvent.click(screen.getByRole('button', { name: /นำเข้า 1 ออเดอร์/i }))
  expect(await screen.findByText(/นำเข้าสำเร็จ 1 ออเดอร์/i)).toBeInTheDocument()
})

test('overwrite guard: shows confirm dialog then re-imports with force', async () => {
  commitImport
    .mockResolvedValueOnce({ created: 0, overwrites: ['PO-1'] })
    .mockResolvedValueOnce({ created: 1, overwrites: ['PO-1'] })
  await uploadAndPreview()
  await userEvent.click(screen.getByRole('button', { name: /นำเข้า 1 ออเดอร์/i }))

  expect(await screen.findByText(/มีออเดอร์ซ้ำ/i)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /ทับของเดิม/i }))

  expect(await screen.findByText(/นำเข้าสำเร็จ 1 ออเดอร์/i)).toBeInTheDocument()
  expect(commitImport).toHaveBeenNthCalledWith(1, expect.any(String), expect.anything(), { force: false })
  expect(commitImport).toHaveBeenNthCalledWith(2, expect.any(String), expect.anything(), { force: true })
})

test('overwrite guard: cancelling the dialog dismisses it without a second import', async () => {
  commitImport.mockResolvedValueOnce({ created: 0, overwrites: ['PO-1'] })
  await uploadAndPreview()
  await userEvent.click(screen.getByRole('button', { name: /นำเข้า 1 ออเดอร์/i }))

  expect(await screen.findByText(/มีออเดอร์ซ้ำ/i)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /ยกเลิก/i }))

  expect(screen.queryByText(/มีออเดอร์ซ้ำ/i)).not.toBeInTheDocument()
  expect(commitImport).toHaveBeenCalledTimes(1)
})
