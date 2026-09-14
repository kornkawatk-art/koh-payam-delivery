import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PierLoad from './PierLoad'

const getOrCreateShipDay = vi.fn()
const listOrdersForDay = vi.fn()
const setOrderBoat = vi.fn().mockResolvedValue(undefined)
const setOrderPierName = vi.fn().mockResolvedValue(undefined)
const updateOrderStatus = vi.fn().mockResolvedValue(undefined)
const listDistinctPierNames = vi.fn().mockResolvedValue([])
const attachEvidencePhoto = vi.fn().mockResolvedValue(undefined)
const removeEvidencePhoto = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/api/shipDays', () => ({
  getOrCreateShipDay: (...a: unknown[]) => getOrCreateShipDay(...a),
  listOrdersForDay: (...a: unknown[]) => listOrdersForDay(...a),
}))
vi.mock('../../lib/api/orders', () => ({
  setOrderBoat: (...a: unknown[]) => setOrderBoat(...a),
  setOrderPierName: (...a: unknown[]) => setOrderPierName(...a),
  updateOrderStatus: (...a: unknown[]) => updateOrderStatus(...a),
  listDistinctPierNames: (...a: unknown[]) => listDistinctPierNames(...a),
}))
vi.mock('../../lib/api/photos', () => ({
  attachEvidencePhoto: (...a: unknown[]) => attachEvidencePhoto(...a),
  removeEvidencePhoto: (...a: unknown[]) => removeEvidencePhoto(...a),
}))
vi.mock('../../components/PhotoCapture', () => ({
  default: ({
    onUploaded,
    onRemoved,
    onBusyChange,
  }: {
    onUploaded: (k: string) => void
    onRemoved?: (k: string) => void
    onBusyChange?: (busy: boolean) => void
  }) => (
    <>
      <button onClick={() => onUploaded('evidence/o1/key-1.jpg')}>mock-upload</button>
      <button onClick={() => onRemoved?.('evidence/o1/key-1.jpg')}>mock-remove</button>
      <button onClick={() => onBusyChange?.(true)}>mock-photo-busy</button>
      <button onClick={() => onBusyChange?.(false)}>mock-photo-idle</button>
    </>
  ),
}))

const orders = [
  {
    id: 'o1',
    makro_order_no: 'PO-1',
    customer_name_en: 'BLUE VIEW',
    status: 'packed',
    boat_id: null,
    paper_box_count: 2,
    foam_box_count: 1,
    piece_count: 0,
    outstanding_amount: null,
    payment_method: null,
    packer_name: null,
    pier_name: null,
  },
  {
    id: 'o2',
    makro_order_no: 'PO-2',
    customer_name_en: 'RED SUN',
    status: 'shipped',
    boat_id: null,
    paper_box_count: 0,
    foam_box_count: 0,
    piece_count: 0,
    outstanding_amount: null,
    payment_method: null,
    packer_name: null,
    pier_name: null,
  },
]

beforeEach(() => {
  getOrCreateShipDay.mockReset().mockResolvedValue({
    id: 'sd1',
    boats: [
      { id: '1', name: 'เรือ 1' },
      { id: '2', name: 'เรือ 2' },
    ],
  })
  listOrdersForDay.mockReset().mockResolvedValue(orders)
  setOrderBoat.mockClear()
  setOrderPierName.mockClear()
  updateOrderStatus.mockClear()
  attachEvidencePhoto.mockClear()
  removeEvidencePhoto.mockClear()
  listDistinctPierNames.mockReset().mockResolvedValue([])
})

test('lists only packed / at_pier orders for the day', async () => {
  render(<PierLoad />)
  expect(await screen.findByRole('button', { name: /PO-1/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /PO-2/ })).not.toBeInTheDocument()
})

test('the order-list badge sums paper + foam + piece counts as "รวม"', async () => {
  listOrdersForDay.mockReset().mockResolvedValue([
    { ...orders[0], paper_box_count: 2, foam_box_count: 1, piece_count: 4 },
  ])
  render(<PierLoad />)
  expect(await screen.findByText('7 รวม')).toBeInTheDocument()
})

test('selects an order then picks เรือ 2 -> calls setOrderBoat(orderId, "2")', async () => {
  render(<PierLoad />)
  await userEvent.click(await screen.findByRole('button', { name: /PO-1/ }))
  await userEvent.click(screen.getByRole('button', { name: 'เรือ 2' }))
  expect(setOrderBoat).toHaveBeenCalledWith('o1', '2')
})

test('"ส่งขึ้นเรือแล้ว" is blocked until a boat is chosen AND >=1 evidence photo', async () => {
  render(<PierLoad />)
  await userEvent.click(await screen.findByRole('button', { name: /PO-1/ }))

  const ship = screen.getByRole('button', { name: 'ส่งขึ้นเรือแล้ว' })
  expect(ship).toBeDisabled()

  await userEvent.click(screen.getByRole('button', { name: 'เรือ 2' }))
  expect(ship).toBeDisabled() // boat chosen, still no photo

  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  await waitFor(() =>
    expect(attachEvidencePhoto).toHaveBeenCalledWith('o1', 'evidence/o1/key-1.jpg', {
      stage: 'handoff',
    }),
  )
  await waitFor(() => expect(ship).toBeEnabled())

  await userEvent.click(ship)
  expect(updateOrderStatus).toHaveBeenCalledWith('o1', 'shipped')
})

test('removing the only evidence photo calls removeEvidencePhoto(orderId, key) and re-blocks "ส่งขึ้นเรือแล้ว"', async () => {
  render(<PierLoad />)
  await userEvent.click(await screen.findByRole('button', { name: /PO-1/ }))
  await userEvent.click(screen.getByRole('button', { name: 'เรือ 2' }))
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  const ship = screen.getByRole('button', { name: 'ส่งขึ้นเรือแล้ว' })
  await waitFor(() => expect(ship).toBeEnabled())

  await userEvent.click(screen.getByRole('button', { name: 'mock-remove' }))

  await waitFor(() =>
    expect(removeEvidencePhoto).toHaveBeenCalledWith('o1', 'evidence/o1/key-1.jpg'),
  )
  await waitFor(() => expect(ship).toBeDisabled())
})

test('typing a pier name and shipping calls setOrderPierName then updateOrderStatus("shipped") in that order', async () => {
  render(<PierLoad />)
  await userEvent.click(await screen.findByRole('button', { name: /PO-1/ }))
  await userEvent.click(screen.getByRole('button', { name: 'เรือ 2' }))
  await userEvent.type(screen.getByLabelText('ชื่อคนลงเรือ'), 'สมหญิง')
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  const ship = screen.getByRole('button', { name: 'ส่งขึ้นเรือแล้ว' })
  await waitFor(() => expect(ship).toBeEnabled())

  await userEvent.click(ship)

  expect(setOrderPierName).toHaveBeenCalledWith('o1', 'สมหญิง')
  expect(updateOrderStatus).toHaveBeenCalledWith('o1', 'shipped')
  expect(setOrderPierName.mock.invocationCallOrder[0]).toBeLessThan(
    updateOrderStatus.mock.invocationCallOrder[0],
  )
})

test('the packer-name subtitle renders on the picker list when present and is absent when null', async () => {
  listOrdersForDay.mockReset().mockResolvedValue([
    { ...orders[0], packer_name: 'สมชาย' },
  ])
  render(<PierLoad />)
  expect(await screen.findByText('คนแพ็ค: สมชาย')).toBeInTheDocument()
})

test('the packer-name subtitle is omitted entirely when packer_name is null', async () => {
  render(<PierLoad />)
  await screen.findByRole('button', { name: /PO-1/ })
  expect(screen.queryByText(/คนแพ็ค/)).not.toBeInTheDocument()
})

test('"ส่งขึ้นเรือแล้ว" is also blocked while a photo is still uploading', async () => {
  render(<PierLoad />)
  await userEvent.click(await screen.findByRole('button', { name: /PO-1/ }))
  await userEvent.click(screen.getByRole('button', { name: 'เรือ 2' }))
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  const ship = screen.getByRole('button', { name: 'ส่งขึ้นเรือแล้ว' })
  await waitFor(() => expect(ship).toBeEnabled())

  await userEvent.click(screen.getByRole('button', { name: 'mock-photo-busy' }))
  expect(ship).toBeDisabled()
  expect(
    screen.getByText('กำลังอัปโหลดรูป กรุณารอสักครู่ก่อนส่งขึ้นเรือ'),
  ).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'mock-photo-idle' }))
  expect(ship).toBeEnabled()
})

test('shows the collect-cash alert when outstanding_amount > 0', async () => {
  listOrdersForDay.mockReset().mockResolvedValue([
    { ...orders[0], outstanding_amount: 6172.5, payment_method: 'Pay On Delivery' },
  ])
  render(<PierLoad />)
  await userEvent.click(await screen.findByRole('button', { name: /PO-1/ }))
  expect(
    await screen.findByText('เก็บเงินปลายทาง ฿6,172.50 (Pay On Delivery)'),
  ).toBeInTheDocument()
})

test('hides the collect-cash alert when outstanding_amount is 0 or null', async () => {
  listOrdersForDay.mockReset().mockResolvedValue([orders[0]])
  render(<PierLoad />)
  await userEvent.click(await screen.findByRole('button', { name: /PO-1/ }))
  expect(screen.queryByText(/เก็บเงินปลายทาง/)).not.toBeInTheDocument()
})

test('shows a Thai error state (not a permanent spinner) when loading fails', async () => {
  listOrdersForDay.mockReset().mockRejectedValueOnce(new Error('nope'))
  render(<PierLoad />)
  expect(await screen.findByText('โหลดข้อมูลท่าเรือไม่สำเร็จ')).toBeInTheDocument()
})

test('the retry button re-invokes the loader and recovers after a failure', async () => {
  listOrdersForDay
    .mockReset()
    .mockRejectedValueOnce(new Error('nope'))
    .mockResolvedValue(orders)
  render(<PierLoad />)
  await screen.findByText('โหลดข้อมูลท่าเรือไม่สำเร็จ')
  const callsBefore = listOrdersForDay.mock.calls.length

  await userEvent.click(screen.getByRole('button', { name: 'ลองใหม่' }))

  await waitFor(() =>
    expect(listOrdersForDay.mock.calls.length).toBeGreaterThan(callsBefore),
  )
  expect(await screen.findByRole('button', { name: /PO-1/ })).toBeInTheDocument()
})
