import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PackOrder from './PackOrder'

const getOrder = vi.fn()
const updateOrderStatus = vi.fn().mockResolvedValue(undefined)
const savePack = vi.fn().mockResolvedValue(undefined)
const listDistinctPackerNames = vi.fn().mockResolvedValue([])
const listPendingBackordersForOrder = vi.fn().mockResolvedValue([])
const markBackorderFulfilled = vi.fn().mockResolvedValue(undefined)
const attachEvidencePhoto = vi.fn().mockResolvedValue(undefined)
const removeEvidencePhoto = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/api/orders', () => ({
  getOrder: (...a: unknown[]) => getOrder(...a),
  updateOrderStatus: (...a: unknown[]) => updateOrderStatus(...a),
}))
vi.mock('../../lib/api/pack', () => ({
  savePack: (...a: unknown[]) => savePack(...a),
  listDistinctPackerNames: (...a: unknown[]) => listDistinctPackerNames(...a),
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
      <button onClick={() => onUploaded('evidence/ord1/key-1.jpg')}>mock-upload</button>
      <button onClick={() => onRemoved?.('evidence/ord1/key-1.jpg')}>mock-remove</button>
      <button onClick={() => onBusyChange?.(true)}>mock-photo-busy</button>
      <button onClick={() => onBusyChange?.(false)}>mock-photo-idle</button>
    </>
  ),
}))
vi.mock('../../lib/api/backorders', () => ({
  listPendingBackordersForOrder: (...a: unknown[]) => listPendingBackordersForOrder(...a),
  markBackorderFulfilled: (...a: unknown[]) => markBackorderFulfilled(...a),
}))

const order = {
  id: 'ord1',
  makro_order_no: 'PO-1',
  customer_name_en: 'BLUE VIEW',
  paper_box_count: 0,
  foam_box_count: 0,
  piece_count: 0,
  order_items: [
    {
      id: 'i1',
      product_name: 'rice',
      makro_item_id: '100001',
      qty_ordered: 2,
      qty_shipped: 1.5,
      item_remark: 'แยกถุง',
      status: 'short',
      is_fresh: null, // pre-feature order -- no Dept data, table stays flat
      packed: false,
    },
    {
      id: 'i2',
      product_name: 'oil',
      qty_ordered: 1,
      qty_shipped: 1,
      item_remark: '',
      status: 'ok',
      is_fresh: null,
      packed: false,
    },
  ],
}

beforeEach(() => {
  getOrder.mockReset().mockResolvedValue(order)
  savePack.mockClear()
  updateOrderStatus.mockClear()
  attachEvidencePhoto.mockClear()
  removeEvidencePhoto.mockClear()
  listPendingBackordersForOrder.mockReset().mockResolvedValue([])
  markBackorderFulfilled.mockClear()
  listDistinctPackerNames.mockReset().mockResolvedValue([])
})

const renderPage = () =>
  render(
    <MemoryRouter
      initialEntries={['/order/ord1/pack']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/order/:id/pack" element={<PackOrder />} />
      </Routes>
    </MemoryRouter>,
  )

test('renders the makro items read-only (ordered / shipped / short badge / remark) plus one pack-tick checkbox per line', async () => {
  renderPage()
  expect(await screen.findByText('rice')).toBeInTheDocument()
  // shipped quantity from the file is shown
  expect(screen.getByText('1.5')).toBeInTheDocument()
  // short line carries the "ขาด" badge, ok line does not
  expect(screen.getByText('ขาด')).toBeInTheDocument()
  expect(screen.getByText('แยกถุง')).toBeInTheDocument()
  // makro item code shown per line
  expect(screen.getByText('100001')).toBeInTheDocument()
  // the only per-item control is the pack-tick checkbox, one per line, unchecked
  const checkboxes = screen.getAllByRole('checkbox')
  expect(checkboxes).toHaveLength(2)
  expect(checkboxes.every((c) => !(c as HTMLInputElement).checked)).toBe(true)
  expect(screen.queryByLabelText(/ของขาด/)).not.toBeInTheDocument()
  // a pre-feature order (is_fresh null on every line) has no fresh/dry headers
  expect(screen.queryByText(/ของสด/)).not.toBeInTheDocument()
  expect(screen.queryByText(/ของแห้ง/)).not.toBeInTheDocument()
})

test('"บันทึก" records the box count via savePack', async () => {
  renderPage()
  await screen.findByText('rice')
  const paper = screen.getByLabelText(/ลังกระดาษ/)
  await userEvent.clear(paper)
  await userEvent.type(paper, '3')
  await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }))

  expect(savePack).toHaveBeenCalledTimes(1)
  expect(savePack.mock.calls[0][0]).toEqual({
    orderId: 'ord1',
    paperCount: 3,
    foamCount: 0,
    pieceCount: 0,
    packerName: '',
    itemPacked: [
      { id: 'i1', packed: false },
      { id: 'i2', packed: false },
    ],
  })
  expect(updateOrderStatus).not.toHaveBeenCalled()
})

test('typing into all three count fields passes the right pieceCount to savePack', async () => {
  renderPage()
  await screen.findByText('rice')
  const paper = screen.getByLabelText(/ลังกระดาษ/)
  const foam = screen.getByLabelText(/ลังโฟม/)
  const piece = screen.getByLabelText(/จำนวนชิ้น/)
  await userEvent.clear(paper)
  await userEvent.type(paper, '2')
  await userEvent.clear(foam)
  await userEvent.type(foam, '1')
  await userEvent.clear(piece)
  await userEvent.type(piece, '5')
  await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }))

  expect(savePack).toHaveBeenCalledTimes(1)
  expect(savePack.mock.calls[0][0]).toEqual({
    orderId: 'ord1',
    paperCount: 2,
    foamCount: 1,
    pieceCount: 5,
    packerName: '',
    itemPacked: [
      { id: 'i1', packed: false },
      { id: 'i2', packed: false },
    ],
  })

  // the read-only total line reflects all three
  expect(
    screen.getByText('ลังกระดาษ 2 · ลังโฟม 1 · ชิ้น 5 · รวม 8'),
  ).toBeInTheDocument()
})

test('typing a packer name passes it through to savePack, and the pack gate is unaffected', async () => {
  renderPage()
  await screen.findByText('rice')
  const packerInput = screen.getByLabelText('ชื่อคนแพ็ค')
  await userEvent.type(packerInput, 'สมชาย')

  const packBtn = screen.getByRole('button', { name: 'บันทึก + แพ็คเสร็จ' })
  expect(packBtn).toBeDisabled() // still gated on photo + box count, unaffected by packer name

  await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }))

  expect(savePack).toHaveBeenCalledTimes(1)
  expect(savePack.mock.calls[0][0]).toEqual({
    orderId: 'ord1',
    paperCount: 0,
    foamCount: 0,
    pieceCount: 0,
    packerName: 'สมชาย',
    itemPacked: [
      { id: 'i1', packed: false },
      { id: 'i2', packed: false },
    ],
  })
})

test('focusing any of the three count fields selects its current value', async () => {
  // jsdom does not expose selectionStart/selectionEnd for type="number"
  // inputs (matches real-browser behaviour, where .select() cannot be
  // verified via selection range either) — so the reliable way to assert
  // "focus selects the value" here is to spy on HTMLInputElement.select()
  // itself and confirm the onFocus handler invokes it.
  const selectSpy = vi.spyOn(HTMLInputElement.prototype, 'select')
  renderPage()
  await screen.findByText('rice')

  const paper = screen.getByLabelText(/ลังกระดาษ/)
  const foam = screen.getByLabelText(/ลังโฟม/)
  const piece = screen.getByLabelText(/จำนวนชิ้น/)

  await userEvent.click(paper)
  expect(selectSpy).toHaveBeenCalledTimes(1)
  await userEvent.click(foam)
  expect(selectSpy).toHaveBeenCalledTimes(2)
  await userEvent.click(piece)
  expect(selectSpy).toHaveBeenCalledTimes(3)

  selectSpy.mockRestore()
})

const satisfyPackGate = async () => {
  const paper = screen.getByLabelText(/ลังกระดาษ/)
  await userEvent.clear(paper)
  await userEvent.type(paper, '2')
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  await waitFor(() =>
    expect(attachEvidencePhoto).toHaveBeenCalledWith('ord1', 'evidence/ord1/key-1.jpg', {
      stage: 'pack',
    }),
  )
  for (const cb of screen.getAllByRole('checkbox')) {
    await userEvent.click(cb)
  }
}

test('"บันทึก + แพ็คเสร็จ" is gated on a pack photo AND at least one box AND every item ticked', async () => {
  renderPage()
  await screen.findByText('rice')
  const packBtn = screen.getByRole('button', { name: 'บันทึก + แพ็คเสร็จ' })
  expect(packBtn).toBeDisabled()
  expect(
    screen.getByText('ต้องถ่ายรูปลังที่แพ็คเสร็จอย่างน้อย 1 รูป กรอกจำนวนลัง/ชิ้นอย่างน้อย 1 และติ๊กสินค้าครบทุกรายการ'),
  ).toBeInTheDocument()

  // a box count alone does not open the gate
  const paper = screen.getByLabelText(/ลังกระดาษ/)
  await userEvent.clear(paper)
  await userEvent.type(paper, '2')
  expect(packBtn).toBeDisabled()

  // a pack photo as well still isn't enough -- items aren't ticked yet
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  await waitFor(() =>
    expect(attachEvidencePhoto).toHaveBeenCalledWith('ord1', 'evidence/ord1/key-1.jpg', {
      stage: 'pack',
    }),
  )
  expect(packBtn).toBeDisabled()

  // ticking only one of the two items still isn't enough
  const [cb1, cb2] = screen.getAllByRole('checkbox')
  await userEvent.click(cb1)
  expect(packBtn).toBeDisabled()

  // ticking the last one opens it
  await userEvent.click(cb2)
  expect(packBtn).toBeEnabled()
  expect(
    screen.queryByText('ต้องถ่ายรูปลังที่แพ็คเสร็จอย่างน้อย 1 รูป กรอกจำนวนลัง/ชิ้นอย่างน้อย 1 และติ๊กสินค้าครบทุกรายการ'),
  ).not.toBeInTheDocument()

  // plain "บันทึก" is never gated by photos/boxes/ticks
  expect(screen.getByRole('button', { name: 'บันทึก' })).toBeEnabled()
})

test('a PO with only piece count (no paper/foam boxes) can still satisfy the pack gate', async () => {
  renderPage()
  await screen.findByText('rice')
  const packBtn = screen.getByRole('button', { name: 'บันทึก + แพ็คเสร็จ' })
  expect(packBtn).toBeDisabled()

  const piece = screen.getByLabelText(/จำนวนชิ้น/)
  await userEvent.clear(piece)
  await userEvent.type(piece, '3')
  expect(packBtn).toBeDisabled() // still needs the pack photo + item ticks

  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  await waitFor(() =>
    expect(attachEvidencePhoto).toHaveBeenCalledWith('ord1', 'evidence/ord1/key-1.jpg', {
      stage: 'pack',
    }),
  )
  for (const cb of screen.getAllByRole('checkbox')) {
    await userEvent.click(cb)
  }
  expect(packBtn).toBeEnabled()
})

test('the "เลือกทั้งหมด"/"ล้างทั้งหมด" toggle checks or clears every item at once', async () => {
  renderPage()
  await screen.findByText('rice')
  const toggleBtn = screen.getByRole('button', { name: 'เลือกทั้งหมด' })
  const checkboxes = () => screen.getAllByRole('checkbox') as HTMLInputElement[]
  expect(checkboxes().every((c) => !c.checked)).toBe(true)

  await userEvent.click(toggleBtn)
  expect(checkboxes().every((c) => c.checked)).toBe(true)
  expect(screen.getByRole('button', { name: 'ล้างทั้งหมด' })).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'ล้างทั้งหมด' }))
  expect(checkboxes().every((c) => !c.checked)).toBe(true)
  expect(screen.getByRole('button', { name: 'เลือกทั้งหมด' })).toBeInTheDocument()
})

test('splits items under "ของสด"/"ของแห้ง" headers once the order carries Dept data', async () => {
  getOrder.mockReset().mockResolvedValue({
    ...order,
    order_items: [
      { ...order.order_items[0], is_fresh: true },
      { ...order.order_items[1], is_fresh: false },
    ],
  })
  renderPage()
  await screen.findByText('rice')
  expect(screen.getByText('ของสด (1)')).toBeInTheDocument()
  expect(screen.getByText('ของแห้ง (1)')).toBeInTheDocument()
})

test('removing the only pack photo calls removeEvidencePhoto(orderId, key) and re-locks the "บันทึก + แพ็คเสร็จ" gate', async () => {
  renderPage()
  await screen.findByText('rice')
  await satisfyPackGate()
  const packBtn = screen.getByRole('button', { name: 'บันทึก + แพ็คเสร็จ' })
  expect(packBtn).toBeEnabled()

  await userEvent.click(screen.getByRole('button', { name: 'mock-remove' }))

  await waitFor(() =>
    expect(removeEvidencePhoto).toHaveBeenCalledWith('ord1', 'evidence/ord1/key-1.jpg'),
  )
  await waitFor(() => expect(packBtn).toBeDisabled())
})

test('a revisit seeds the pack-photo count AND each item\'s saved "packed" tick', async () => {
  getOrder.mockReset().mockResolvedValue({
    ...order,
    paper_box_count: 1,
    evidence_photos: [{ id: 'e1', r2_key: 'evidence/ord1/a.jpg', stage: 'pack' }],
    order_items: order.order_items.map((it) => ({ ...it, packed: true })),
  })
  renderPage()
  await screen.findByText('rice')
  const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
  expect(checkboxes.every((c) => c.checked)).toBe(true)
  expect(screen.getByRole('button', { name: 'บันทึก + แพ็คเสร็จ' })).toBeEnabled()
})

test('a revisit where only some items were previously ticked leaves the pack gate closed', async () => {
  getOrder.mockReset().mockResolvedValue({
    ...order,
    paper_box_count: 1,
    evidence_photos: [{ id: 'e1', r2_key: 'evidence/ord1/a.jpg', stage: 'pack' }],
    order_items: [
      { ...order.order_items[0], packed: true },
      { ...order.order_items[1], packed: false },
    ],
  })
  renderPage()
  await screen.findByText('rice')
  expect(screen.getByRole('button', { name: 'บันทึก + แพ็คเสร็จ' })).toBeDisabled()
})

test('a revisit also shows the already-saved pack photo as a removable thumbnail (not just a count)', async () => {
  getOrder.mockReset().mockResolvedValue({
    ...order,
    paper_box_count: 1,
    evidence_photos: [
      { id: 'e1', r2_key: 'evidence/ord1/a.jpg', stage: 'pack' },
      { id: 'e2', r2_key: 'evidence/ord1/handoff.jpg', stage: 'handoff' }, // wrong stage -- excluded
    ],
  })
  renderPage()
  await screen.findByText('rice')
  const imgs = screen.getAllByAltText('รูปที่อัปโหลด')
  expect(imgs).toHaveLength(1)
  expect(imgs[0]).toHaveAttribute('src', expect.stringContaining('evidence/ord1/a.jpg'))
})

test('"บันทึก + แพ็คเสร็จ" saves first, then marks the order packed', async () => {
  renderPage()
  await screen.findByText('rice')
  await satisfyPackGate()
  await userEvent.click(screen.getByRole('button', { name: 'บันทึก + แพ็คเสร็จ' }))

  expect(savePack).toHaveBeenCalledTimes(1)
  expect(updateOrderStatus).toHaveBeenCalledWith('ord1', 'packed')
  expect(savePack.mock.invocationCallOrder[0]).toBeLessThan(
    updateOrderStatus.mock.invocationCallOrder[0],
  )
})

test('blocks both save buttons while a photo is still uploading, with a Thai hint', async () => {
  renderPage()
  await screen.findByText('rice')

  await userEvent.click(screen.getByRole('button', { name: 'mock-photo-busy' }))

  expect(screen.getByRole('button', { name: 'บันทึก' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'บันทึก + แพ็คเสร็จ' })).toBeDisabled()
  expect(
    screen.getByText('กำลังอัปโหลดรูป กรุณารอสักครู่ก่อนกดบันทึก'),
  ).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'mock-photo-idle' }))
  expect(screen.getByRole('button', { name: 'บันทึก' })).toBeEnabled()
  expect(
    screen.queryByText('กำลังอัปโหลดรูป กรุณารอสักครู่ก่อนกดบันทึก'),
  ).not.toBeInTheDocument()
})

test('shows carry-over backorders and fulfils one on "ส่งแล้ว"', async () => {
  listPendingBackordersForOrder.mockResolvedValueOnce([
    {
      id: 'b1',
      source_order_id: 's1',
      reason: 'shortage',
      product_name: 'sugar',
      qty: 4,
      target_ship_date: '2026-10-01',
      target_order_id: 'ord1',
      status: 'pending',
    },
  ])
  renderPage()
  expect(await screen.findByText('ของค้างส่งจากออเดอร์ก่อนหน้า')).toBeInTheDocument()
  expect(screen.getByText('sugar x4')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'ส่งแล้ว' }))
  expect(markBackorderFulfilled).toHaveBeenCalledWith('b1')
  expect(screen.queryByText('sugar x4')).not.toBeInTheDocument()
})
