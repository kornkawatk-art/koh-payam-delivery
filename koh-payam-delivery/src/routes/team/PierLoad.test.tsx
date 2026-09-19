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
const listEvidencePhotos = vi.fn().mockResolvedValue([])
const listOrdersForCustomerDay = vi.fn().mockResolvedValue([])
const setOrderBoats = vi.fn().mockResolvedValue(2)

vi.mock('../../lib/api/shipDays', () => ({
  getOrCreateShipDay: (...a: unknown[]) => getOrCreateShipDay(...a),
  listOrdersForDay: (...a: unknown[]) => listOrdersForDay(...a),
}))
vi.mock('../../lib/api/orders', () => ({
  listOrdersForCustomerDay: (...a: unknown[]) => listOrdersForCustomerDay(...a),
  setOrderBoats: (...a: unknown[]) => setOrderBoats(...a),
  setOrderBoat: (...a: unknown[]) => setOrderBoat(...a),
  setOrderPierName: (...a: unknown[]) => setOrderPierName(...a),
  updateOrderStatus: (...a: unknown[]) => updateOrderStatus(...a),
  listDistinctPierNames: (...a: unknown[]) => listDistinctPierNames(...a),
}))
vi.mock('../../lib/api/photos', () => ({
  attachEvidencePhoto: (...a: unknown[]) => attachEvidencePhoto(...a),
  removeEvidencePhoto: (...a: unknown[]) => removeEvidencePhoto(...a),
  listEvidencePhotos: (...a: unknown[]) => listEvidencePhotos(...a),
}))
vi.mock('../../components/PhotoCapture', () => ({
  default: ({
    onUploaded,
    onRemoved,
    onBusyChange,
    initialPhotos,
  }: {
    onUploaded: (k: string) => void
    onRemoved?: (k: string) => void
    onBusyChange?: (busy: boolean) => void
    initialPhotos?: { key: string; url: string }[]
  }) => (
    <>
      {(initialPhotos ?? []).map((p) => (
        <img key={p.key} src={p.url} alt="รูปที่อัปโหลด" />
      ))}
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
  listEvidencePhotos.mockReset().mockResolvedValue([])
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

test('a photo already saved from an earlier visit is shown and seeds the ship gate on selection, without needing a fresh upload', async () => {
  listEvidencePhotos.mockReset().mockResolvedValue([
    { key: 'evidence/o1/old.jpg', url: 'https://pub.example/evidence/o1/old.jpg' },
  ])
  render(<PierLoad />)
  await userEvent.click(await screen.findByRole('button', { name: /PO-1/ }))

  expect(listEvidencePhotos).toHaveBeenCalledWith('o1', 'handoff')
  await screen.findByAltText('รูปที่อัปโหลด') // the pre-existing photo's thumbnail

  await userEvent.click(screen.getByRole('button', { name: 'เรือ 2' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'ส่งขึ้นเรือแล้ว' })).toBeEnabled())
})

test('a failed fetch of already-saved photos fails open (empty list) instead of blocking the screen', async () => {
  listEvidencePhotos.mockReset().mockRejectedValue(new Error('boom'))
  render(<PierLoad />)
  await userEvent.click(await screen.findByRole('button', { name: /PO-1/ }))
  await userEvent.click(await screen.findByRole('button', { name: 'เรือ 2' }))
  // Still reachable and usable -- just no pre-existing photo shown.
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'ส่งขึ้นเรือแล้ว' })).toBeEnabled())
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

test('a PO packed together with another is labelled with that PO on the picker list', async () => {
  listOrdersForDay.mockReset().mockResolvedValue([
    { ...orders[0], packed_with: { makro_order_no: 'PO-9' } },
  ])
  render(<PierLoad />)
  expect(await screen.findByText('แพ็ครวมกับ PO-9')).toBeInTheDocument()
})

test('an ordinary PO shows no packed-together label on the picker list', async () => {
  render(<PierLoad />)
  await screen.findByRole('button', { name: /PO-1/ })
  expect(screen.queryByText(/แพ็ครวมกับ/)).not.toBeInTheDocument()
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

const mate = (id: string, no: string, status: string, extra: object = {}) => ({
  ...orders[0],
  id,
  makro_order_no: no,
  status,
  customer_phone: '0811111111',
  ...extra,
})

test('a customer with 2+ ready POs shows as ONE row (N PO + summed boxes) instead of one row per PO', async () => {
  listOrdersForDay.mockReset().mockResolvedValue([
    mate('a', 'PO-A', 'packed'),
    mate('b', 'PO-B', 'at_pier', { paper_box_count: 1, foam_box_count: 0 }),
    orders[1],
  ])
  render(<PierLoad />)
  const row = await screen.findByRole('button', { name: /BLUE VIEW/ })
  expect(row).toHaveTextContent('2 PO')
  expect(row).toHaveTextContent('PO-A, PO-B')
  expect(row).toHaveTextContent('4 รวม') // (2+1+0) + (1+0+0)
  expect(screen.queryByRole('button', { name: /^PO-A · / })).not.toBeInTheDocument()
})

test('the group row notes how many of that customer POs are still waiting to be packed', async () => {
  listOrdersForDay.mockReset().mockResolvedValue([
    mate('a', 'PO-A', 'packed'),
    mate('b', 'PO-B', 'packed'),
    mate('c', 'PO-C', 'imported'),
  ])
  render(<PierLoad />)
  expect(await screen.findByText('อีก 1 ออเดอร์ยังรอแพ็ค')).toBeInTheDocument()
})

test('a lone ready PO whose siblings are still waiting stays a normal row, with the waiting note', async () => {
  listOrdersForDay.mockReset().mockResolvedValue([
    mate('a', 'PO-A', 'packed'),
    mate('c', 'PO-C', 'imported'),
  ])
  render(<PierLoad />)
  expect(await screen.findByRole('button', { name: /PO-A · BLUE VIEW/ })).toBeInTheDocument()
  expect(screen.getByText('อีก 1 ออเดอร์ของลูกค้านี้ยังรอแพ็ค')).toBeInTheDocument()
  expect(screen.queryByText('2 PO')).not.toBeInTheDocument()
})

test('a customer with no ready PO at all is not listed', async () => {
  listOrdersForDay.mockReset().mockResolvedValue([
    mate('c', 'PO-C', 'imported'),
    mate('d', 'PO-D', 'shipped'),
  ])
  render(<PierLoad />)
  expect(await screen.findByText('ไม่มีออเดอร์ที่พร้อมส่งขึ้นเรือ')).toBeInTheDocument()
})

test('opening a customer row shows the group panel for that customer and phone', async () => {
  listOrdersForDay.mockReset().mockResolvedValue([mate('a', 'PO-A', 'packed'), mate('b', 'PO-B', 'packed')])
  listOrdersForCustomerDay.mockReset().mockResolvedValue([
    { ...mate('a', 'PO-A', 'packed'), evidence_photos: [] },
    { ...mate('b', 'PO-B', 'packed'), evidence_photos: [] },
  ])
  render(<PierLoad />)
  await userEvent.click(await screen.findByRole('button', { name: /BLUE VIEW/ }))
  expect(await screen.findByText('เลือกเรือ (ทุกออเดอร์ไปเรือลำเดียวกัน)')).toBeInTheDocument()
  expect(listOrdersForCustomerDay).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), '0811111111')
  // back returns to the list
  await userEvent.click(screen.getByRole('button', { name: '← กลับ' }))
  expect(await screen.findByRole('button', { name: /BLUE VIEW/ })).toBeInTheDocument()
})
