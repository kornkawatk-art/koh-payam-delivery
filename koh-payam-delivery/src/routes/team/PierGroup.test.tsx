import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PierGroup from './PierGroup'

const listOrdersForCustomerDay = vi.fn()
const setOrderBoats = vi.fn().mockResolvedValue(2)
const setOrderPierName = vi.fn().mockResolvedValue(undefined)
const updateOrderStatus = vi.fn().mockResolvedValue(undefined)
const listDistinctPierNames = vi.fn().mockResolvedValue([])
const attachEvidencePhoto = vi.fn().mockResolvedValue(undefined)
const removeEvidencePhoto = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/api/orders', () => ({
  listOrdersForCustomerDay: (...a: unknown[]) => listOrdersForCustomerDay(...a),
  setOrderBoats: (...a: unknown[]) => setOrderBoats(...a),
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
    orderId,
    onUploaded,
    onRemoved,
    onBusyChange,
    initialPhotos,
  }: {
    orderId: string
    onUploaded: (k: string) => void
    onRemoved?: (k: string) => Promise<void>
    onBusyChange?: (b: boolean) => void
    initialPhotos?: { key: string; url: string }[]
  }) => (
    <>
      <span>photo-target:{orderId}</span>
      {(initialPhotos ?? []).map((p) => (
        <img key={p.key} src={p.url} alt="รูปที่อัปโหลด" />
      ))}
      <button onClick={() => onUploaded('evidence/new.jpg')}>mock-upload</button>
      <button onClick={() => void Promise.resolve(onRemoved?.('evidence/a.jpg')).catch(() => {})}>mock-remove</button>
      <button onClick={() => onBusyChange?.(true)}>mock-photo-busy</button>
    </>
  ),
}))

const boats = [
  { id: '1', name: 'เรือ 1' },
  { id: '2', name: 'เรือ 2' },
]

const po = (id: string, no: string, status: string, extra: object = {}) => ({
  id,
  makro_order_no: no,
  customer_name_en: 'BLUE VIEW',
  status,
  boat_id: null,
  paper_box_count: 0,
  foam_box_count: 0,
  piece_count: 0,
  outstanding_amount: 0,
  pier_name: null,
  packed_with_order_id: null,
  evidence_photos: [],
  ...extra,
})

const orders = () => [
  po('o1', 'PO-1', 'packed', { paper_box_count: 3 }),
  po('o2', 'PO-2', 'packed', { packed_with_order_id: 'o1' }),
  po('o3', 'PO-3', 'imported'),
  po('o4', 'PO-4', 'shipped'),
]

const onBack = vi.fn()
const onShipped = vi.fn()

beforeEach(() => {
  listOrdersForCustomerDay.mockReset().mockResolvedValue(orders())
  setOrderBoats.mockReset().mockResolvedValue(2)
  setOrderPierName.mockReset().mockResolvedValue(undefined)
  updateOrderStatus.mockReset().mockResolvedValue(undefined)
  attachEvidencePhoto.mockReset().mockResolvedValue(undefined)
  removeEvidencePhoto.mockReset().mockResolvedValue(undefined)
  onBack.mockClear()
  onShipped.mockClear()
})

const renderPanel = () =>
  render(
    <PierGroup date="2026-10-01" phone="0811111111" boats={boats} onBack={onBack} onShipped={onShipped} />,
  )

const readyForShip = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'เรือ 2' }))
  await waitFor(() => expect(setOrderBoats).toHaveBeenCalled())
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  await waitFor(() => expect(attachEvidencePhoto).toHaveBeenCalledTimes(2))
}

test('lists only the ready POs, warns about POs still waiting to be packed, and shows the packed-together link', async () => {
  renderPanel()
  expect(await screen.findByText('BLUE VIEW · 2 ออเดอร์')).toBeInTheDocument()
  expect(screen.getByText('PO-1')).toBeInTheDocument()
  expect(screen.getByText('PO-2')).toBeInTheDocument()
  expect(screen.queryByText('PO-4')).not.toBeInTheDocument() // already shipped
  expect(screen.getByText(/อีก 1 ออเดอร์ของลูกค้ารายนี้ยังรอแพ็ค \(PO-3\)/)).toBeInTheDocument()
  expect(screen.getByText(/แพ็ครวมกับ PO-1/)).toBeInTheDocument()
  expect(listOrdersForCustomerDay).toHaveBeenCalledWith('2026-10-01', '0811111111')
})

test('choosing a boat assigns it to every ready PO at once (and never to waiting/shipped ones)', async () => {
  renderPanel()
  await screen.findByText('PO-1')
  await userEvent.click(screen.getByRole('button', { name: 'เรือ 2' }))
  expect(setOrderBoats).toHaveBeenCalledWith(['o1', 'o2'], '2')
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'เรือ 2' }).className).toContain('bg-ink'),
  )
})

test('"ส่งขึ้นเรือแล้ว" needs a boat AND at least one photo, and waits out an upload in progress', async () => {
  renderPanel()
  await screen.findByText('PO-1')
  const ship = screen.getByRole('button', { name: /ส่งขึ้นเรือแล้ว/ })
  expect(ship).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'เรือ 1' }))
  await waitFor(() => expect(setOrderBoats).toHaveBeenCalled())
  expect(ship).toBeDisabled() // boat alone is not enough
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  await waitFor(() => expect(ship).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'mock-photo-busy' }))
  expect(ship).toBeDisabled()
  expect(screen.getByText(/กำลังอัปโหลดรูป/)).toBeInTheDocument()
})

test('an uploaded photo is attached (stage handoff) to EVERY ready PO, using one shared key', async () => {
  renderPanel()
  await screen.findByText('PO-1')
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  await waitFor(() => expect(attachEvidencePhoto).toHaveBeenCalledTimes(2))
  expect(attachEvidencePhoto).toHaveBeenCalledWith('o1', 'evidence/new.jpg', { stage: 'handoff' })
  expect(attachEvidencePhoto).toHaveBeenCalledWith('o2', 'evidence/new.jpg', { stage: 'handoff' })
})

test('removing a photo removes it from every ready PO', async () => {
  listOrdersForCustomerDay.mockResolvedValue(
    orders().map((o) =>
      ['o1', 'o2'].includes(o.id)
        ? { ...o, evidence_photos: [{ id: 'e', r2_key: 'evidence/a.jpg', stage: 'handoff' }] }
        : o,
    ),
  )
  renderPanel()
  await screen.findByText('PO-1')
  expect(screen.getAllByAltText('รูปที่อัปโหลด')).toHaveLength(1) // one shared photo, not one per PO
  await userEvent.click(screen.getByRole('button', { name: 'mock-remove' }))
  await waitFor(() => expect(removeEvidencePhoto).toHaveBeenCalledTimes(2))
  expect(removeEvidencePhoto).toHaveBeenCalledWith('o1', 'evidence/a.jpg')
  expect(removeEvidencePhoto).toHaveBeenCalledWith('o2', 'evidence/a.jpg')
})

test('shipping sets the pier name and marks every ready PO shipped in order, then reports back', async () => {
  renderPanel()
  await screen.findByText('PO-1')
  await readyForShip()
  await userEvent.type(screen.getByLabelText('ชื่อคนลงเรือ'), 'สมหมาย')
  await userEvent.click(screen.getByRole('button', { name: /ส่งขึ้นเรือแล้ว/ }))

  await waitFor(() => expect(onShipped).toHaveBeenCalledWith('ส่งขึ้นเรือแล้ว 2 ออเดอร์ของ BLUE VIEW'))
  expect(setOrderPierName.mock.calls).toEqual([
    ['o1', 'สมหมาย'],
    ['o2', 'สมหมาย'],
  ])
  expect(updateOrderStatus.mock.calls).toEqual([
    ['o1', 'shipped'],
    ['o2', 'shipped'],
  ])
})

test('shipping tops up any PO that is missing one of the group photos before shipping', async () => {
  listOrdersForCustomerDay.mockResolvedValue(
    orders().map((o) =>
      o.id === 'o1'
        ? { ...o, boat_id: '2', status: 'at_pier', evidence_photos: [{ id: 'e', r2_key: 'evidence/a.jpg', stage: 'handoff' }] }
        : o.id === 'o2'
          ? { ...o, boat_id: '2', status: 'at_pier' } // o2 has no photo yet
          : o,
    ),
  )
  renderPanel()
  await screen.findByText('PO-1')
  await userEvent.click(screen.getByRole('button', { name: /ส่งขึ้นเรือแล้ว/ }))
  await waitFor(() => expect(onShipped).toHaveBeenCalled())
  expect(attachEvidencePhoto).toHaveBeenCalledTimes(1)
  expect(attachEvidencePhoto).toHaveBeenCalledWith('o2', 'evidence/a.jpg', { stage: 'handoff' })
  expect(attachEvidencePhoto.mock.invocationCallOrder[0]).toBeLessThan(updateOrderStatus.mock.invocationCallOrder[0])
})

test('a failure part-way reports how many were shipped and a retry only handles the rest', async () => {
  updateOrderStatus.mockReset().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('boom'))
  renderPanel()
  await screen.findByText('PO-1')
  await readyForShip()
  await userEvent.click(screen.getByRole('button', { name: /ส่งขึ้นเรือแล้ว/ }))
  expect(await screen.findByText(/ส่งขึ้นเรือแล้ว 1 ออเดอร์ \(เหลืออีก 1\) แล้วเกิดข้อผิดพลาด: boom/)).toBeInTheDocument()
  expect(onShipped).not.toHaveBeenCalled()

  // PO-1 is out of the group now; PO-2 is what's left
  await waitFor(() => expect(screen.getByText('BLUE VIEW · 1 ออเดอร์')).toBeInTheDocument())
  updateOrderStatus.mockReset().mockResolvedValue(undefined)
  await userEvent.click(screen.getByRole('button', { name: /ส่งขึ้นเรือแล้ว/ }))
  await waitFor(() => expect(onShipped).toHaveBeenCalledWith('ส่งขึ้นเรือแล้ว 1 ออเดอร์ของ BLUE VIEW'))
  expect(updateOrderStatus.mock.calls).toEqual([['o2', 'shipped']])
})

test('POs already on different boats highlight none and block shipping until one boat is chosen', async () => {
  listOrdersForCustomerDay.mockResolvedValue(
    orders().map((o) => (o.id === 'o1' ? { ...o, boat_id: '1', status: 'at_pier' } : o.id === 'o2' ? { ...o, boat_id: '2', status: 'at_pier' } : o)),
  )
  renderPanel()
  await screen.findByText('PO-1')
  for (const n of ['เรือ 1', 'เรือ 2'])
    expect(screen.getByRole('button', { name: n }).className).not.toContain('bg-ink')
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  await waitFor(() => expect(attachEvidencePhoto).toHaveBeenCalled())
  expect(screen.getByRole('button', { name: /ส่งขึ้นเรือแล้ว/ })).toBeDisabled()
})

test('sums the cash-on-delivery amount across the ready POs only', async () => {
  listOrdersForCustomerDay.mockResolvedValue(
    orders().map((o) =>
      o.id === 'o1'
        ? { ...o, outstanding_amount: 100 }
        : o.id === 'o2'
          ? { ...o, outstanding_amount: 50.5 }
          : o.id === 'o3'
            ? { ...o, outstanding_amount: 999 } // still waiting: not collected at this shipment
            : o,
    ),
  )
  renderPanel()
  expect(await screen.findByText('เก็บเงินปลายทางรวม ฿150.50')).toBeInTheDocument()
})

test('flags a shortfall when the boat could not be set on every PO', async () => {
  setOrderBoats.mockResolvedValue(1)
  renderPanel()
  await screen.findByText('PO-1')
  await userEvent.click(screen.getByRole('button', { name: 'เรือ 1' }))
  expect(await screen.findByText(/เลือกเรือให้ได้ 1 จาก 2 ออเดอร์/)).toBeInTheDocument()
})

test('shows a Thai error when loading fails, and "back" calls onBack', async () => {
  listOrdersForCustomerDay.mockRejectedValue(new Error('x'))
  const { unmount } = renderPanel()
  expect(await screen.findByText('โหลดออเดอร์ไม่สำเร็จ')).toBeInTheDocument()
  unmount()
  listOrdersForCustomerDay.mockResolvedValue(orders())
  renderPanel()
  await screen.findByText('PO-1')
  await userEvent.click(screen.getByRole('button', { name: '← กลับ' }))
  expect(onBack).toHaveBeenCalled()
})

test('a ship retry after a failure does NOT insert a top-up photo a second time', async () => {
  listOrdersForCustomerDay.mockResolvedValue(
    orders().map((o) =>
      o.id === 'o1'
        ? { ...o, boat_id: '2', status: 'at_pier', evidence_photos: [{ id: 'e', r2_key: 'evidence/a.jpg', stage: 'handoff' }] }
        : o.id === 'o2'
          ? { ...o, boat_id: '2', status: 'at_pier' } // needs the top-up
          : o,
    ),
  )
  // first attempt: o1 ships, then o2's pier name fails -> retry
  setOrderPierName
    .mockReset()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('boom'))
    .mockResolvedValue(undefined)
  renderPanel()
  await screen.findByText('PO-1')
  await userEvent.click(screen.getByRole('button', { name: /ส่งขึ้นเรือแล้ว/ }))
  expect(await screen.findByText(/แล้วเกิดข้อผิดพลาด: boom/)).toBeInTheDocument()
  expect(attachEvidencePhoto).toHaveBeenCalledTimes(1) // (o2, a.jpg) topped up once
  await userEvent.click(screen.getByRole('button', { name: /ส่งขึ้นเรือแล้ว/ }))
  await waitFor(() => expect(onShipped).toHaveBeenCalled())
  expect(attachEvidencePhoto).toHaveBeenCalledTimes(1) // still once: not duplicated on retry
})

test('ship stays disabled while the per-PO photo inserts of a fresh upload are still in flight', async () => {
  const releases: (() => void)[] = []
  attachEvidencePhoto.mockReset().mockImplementation(
    () => new Promise<void>((res) => releases.push(res)),
  )
  renderPanel()
  await screen.findByText('PO-1')
  await userEvent.click(screen.getByRole('button', { name: 'เรือ 2' }))
  await waitFor(() => expect(setOrderBoats).toHaveBeenCalled())
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  await waitFor(() => expect(releases).toHaveLength(1)) // o1's insert pending
  expect(screen.getByRole('button', { name: /ส่งขึ้นเรือแล้ว/ })).toBeDisabled()
  releases[0]() // o1 done -> o2 starts
  await waitFor(() => expect(releases).toHaveLength(2))
  expect(screen.getByRole('button', { name: /ส่งขึ้นเรือแล้ว/ })).toBeDisabled() // o2 still pending
  releases[1]()
  await waitFor(() => expect(screen.getByRole('button', { name: /ส่งขึ้นเรือแล้ว/ })).toBeEnabled())
})

test('if removing a photo fails on some POs, the key stays counted for those POs (state matches the database)', async () => {
  listOrdersForCustomerDay.mockResolvedValue(
    orders().map((o) =>
      ['o1', 'o2'].includes(o.id)
        ? { ...o, boat_id: '2', status: 'at_pier', evidence_photos: [{ id: 'e', r2_key: 'evidence/a.jpg', stage: 'handoff' }] }
        : o,
    ),
  )
  removeEvidencePhoto
    .mockReset()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('nope'))
    .mockResolvedValue(undefined)
  renderPanel()
  await screen.findByText('PO-1')
  await userEvent.click(screen.getByRole('button', { name: 'mock-remove' }))
  await waitFor(() => expect(removeEvidencePhoto).toHaveBeenCalledTimes(2))
  // o2 still has it, so the photo is still shown and shipping is still allowed
  expect(screen.getAllByAltText('รูปที่อัปโหลด')).toHaveLength(1)
  expect(screen.getByRole('button', { name: /ส่งขึ้นเรือแล้ว/ })).toBeEnabled()
  // retrying the removal clears the rest
  await userEvent.click(screen.getByRole('button', { name: 'mock-remove' }))
  await waitFor(() => expect(screen.queryByAltText('รูปที่อัปโหลด')).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: /ส่งขึ้นเรือแล้ว/ })).toBeDisabled()
})

test('when every per-PO attach fails, it tells the user to remove and retake the photo (not "retry at ship")', async () => {
  attachEvidencePhoto.mockReset().mockRejectedValue(new Error('offline'))
  renderPanel()
  await screen.findByText('PO-1')
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  expect(await screen.findByText('แนบรูปไม่สำเร็จ กรุณาลบรูปนี้แล้วถ่ายใหม่')).toBeInTheDocument()
})

test('a boat shortfall re-reads the orders instead of marking every PO as on that boat', async () => {
  setOrderBoats.mockResolvedValue(1)
  renderPanel()
  await screen.findByText('PO-1')
  const before = listOrdersForCustomerDay.mock.calls.length
  await userEvent.click(screen.getByRole('button', { name: 'เรือ 1' }))
  await waitFor(() => expect(listOrdersForCustomerDay.mock.calls.length).toBe(before + 1))
  // server data still has no boat on the POs -> nothing highlighted
  expect(screen.getByRole('button', { name: 'เรือ 1' }).className).not.toContain('bg-ink')
})
