import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PackGroup from './PackGroup'

const listOrdersForCustomerDay = vi.fn()
const updateOrderStatus = vi.fn().mockResolvedValue(undefined)
const savePackGroup = vi.fn().mockResolvedValue(undefined)
const listDistinctPackerNames = vi.fn().mockResolvedValue([])
const listPendingBackordersForOrder = vi.fn().mockResolvedValue([])
const markBackorderFulfilled = vi.fn().mockResolvedValue(undefined)
const attachEvidencePhoto = vi.fn().mockResolvedValue(undefined)
const removeEvidencePhoto = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/api/orders', () => ({
  listOrdersForCustomerDay: (...a: unknown[]) => listOrdersForCustomerDay(...a),
  updateOrderStatus: (...a: unknown[]) => updateOrderStatus(...a),
  // PackOrder.tsx (imported for PackItemRow) pulls these in too
  getOrder: vi.fn(),
}))
vi.mock('../../lib/api/pack', () => ({
  savePackGroup: (...a: unknown[]) => savePackGroup(...a),
  savePack: vi.fn(),
  listDistinctPackerNames: (...a: unknown[]) => listDistinctPackerNames(...a),
}))
vi.mock('../../lib/api/photos', () => ({
  attachEvidencePhoto: (...a: unknown[]) => attachEvidencePhoto(...a),
  removeEvidencePhoto: (...a: unknown[]) => removeEvidencePhoto(...a),
}))
vi.mock('../../components/PhotoCapture', () => ({
  default: ({
    orderId,
    onUploaded,
    initialPhotos,
  }: {
    orderId: string
    onUploaded: (k: string) => void
    initialPhotos?: { key: string; url: string }[]
  }) => (
    <>
      <span>photo-target:{orderId}</span>
      {(initialPhotos ?? []).map((p) => (
        <img key={p.key} src={p.url} alt="รูปที่อัปโหลด" />
      ))}
      <button onClick={() => onUploaded('evidence/o1/key-1.jpg')}>mock-upload</button>
    </>
  ),
}))
vi.mock('../../lib/api/backorders', () => ({
  listPendingBackordersForOrder: (...a: unknown[]) => listPendingBackordersForOrder(...a),
  markBackorderFulfilled: (...a: unknown[]) => markBackorderFulfilled(...a),
}))

const item = (id: string, name: string, extra: object = {}) => ({
  id,
  product_name: name,
  makro_item_id: `code-${id}`,
  qty_ordered: 1,
  qty_shipped: 1,
  item_remark: '',
  status: 'ok',
  is_fresh: null,
  packed: false,
  ...extra,
})

const base = (id: string, no: string, status: string, items: object[], extra: object = {}) => ({
  id,
  makro_order_no: no,
  customer_name_en: 'BLUE VIEW',
  status,
  paper_box_count: 0,
  foam_box_count: 0,
  piece_count: 0,
  packer_name: null,
  evidence_photos: [],
  order_items: items,
  ...extra,
})

// sorted by makro_order_no like the API: PO-0 already packed, PO-1 is primary, PO-2 second
const orders = () => [
  base('o0', 'PO-0', 'packed', [item('i0', 'sugar', { packed: true })]),
  base('o1', 'PO-1', 'imported', [item('i1', 'rice'), item('i2', 'oil')]),
  base('o2', 'PO-2', 'imported', [item('i3', 'salt')]),
]

beforeEach(() => {
  listOrdersForCustomerDay.mockReset().mockResolvedValue(orders())
  savePackGroup.mockClear()
  updateOrderStatus.mockReset().mockResolvedValue(undefined)
  attachEvidencePhoto.mockClear()
  listPendingBackordersForOrder.mockReset().mockResolvedValue([])
  markBackorderFulfilled.mockClear()
})

const renderPage = () =>
  render(
    <MemoryRouter
      initialEntries={['/customer/2026-10-01/0811111111/pack']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/customer/:date/:phone/pack" element={<PackGroup />} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>,
  )

const satisfyGate = async () => {
  const paper = screen.getByLabelText(/ลังกระดาษ/)
  await userEvent.clear(paper)
  await userEvent.type(paper, '2')
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  await waitFor(() => expect(attachEvidencePhoto).toHaveBeenCalled())
  await userEvent.click(screen.getByRole('button', { name: 'เลือกทั้งหมด' }))
}

test('loads by ship date + phone from the URL and merges every PO into one list tagged with its PO number', async () => {
  renderPage()
  await screen.findByText('rice')
  expect(listOrdersForCustomerDay).toHaveBeenCalledWith('2026-10-01', '0811111111')
  expect(screen.getByText('sugar')).toBeInTheDocument()
  expect(screen.getByText('salt')).toBeInTheDocument()
  const ricePO = within(screen.getByText('rice').closest('tr')!).getByText('PO-1')
  expect(ricePO).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('แพ็ครวม · BLUE VIEW · 3 ออเดอร์')
})

test('the primary PO is the first not-yet-packed one: photos attach to it and the note names it', async () => {
  renderPage()
  await screen.findByText('rice')
  expect(screen.getByText('photo-target:o1')).toBeInTheDocument()
  expect(screen.getByText(/ลัง\/ชิ้น\/รูปจะบันทึกไว้ที่ออเดอร์หลัก/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  await waitFor(() =>
    expect(attachEvidencePhoto).toHaveBeenCalledWith('o1', 'evidence/o1/key-1.jpg', { stage: 'pack' }),
  )
})

test('an already-packed PO shows read-only: its tick is checked + disabled and not required by the gate', async () => {
  renderPage()
  await screen.findByText('rice')
  const sugar = screen.getByRole('checkbox', { name: 'แพ็คแล้ว: sugar' }) as HTMLInputElement
  expect(sugar.checked).toBe(true)
  expect(sugar).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: 'แพ็คแล้ว: rice' })).toBeEnabled()
})

test('"บันทึก + แพ็คเสร็จ" needs photo + boxes + every NOT-yet-packed line ticked', async () => {
  renderPage()
  await screen.findByText('rice')
  const packBtn = screen.getByRole('button', { name: 'บันทึก + แพ็คเสร็จ' })
  expect(packBtn).toBeDisabled()

  const paper = screen.getByLabelText(/ลังกระดาษ/)
  await userEvent.clear(paper)
  await userEvent.type(paper, '2')
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  await waitFor(() => expect(attachEvidencePhoto).toHaveBeenCalled())
  expect(packBtn).toBeDisabled() // nothing ticked yet

  await userEvent.click(screen.getByRole('checkbox', { name: 'แพ็คแล้ว: rice' }))
  await userEvent.click(screen.getByRole('checkbox', { name: 'แพ็คแล้ว: oil' }))
  expect(packBtn).toBeDisabled() // PO-2's salt still open
  await userEvent.click(screen.getByRole('checkbox', { name: 'แพ็คแล้ว: salt' }))
  expect(packBtn).toBeEnabled()
})

test('select-all / clear-all only touches the editable lines and flips its label', async () => {
  renderPage()
  await screen.findByText('rice')
  await userEvent.click(screen.getByRole('button', { name: 'เลือกทั้งหมด' }))
  for (const n of ['rice', 'oil', 'salt']) {
    expect((screen.getByRole('checkbox', { name: `แพ็คแล้ว: ${n}` }) as HTMLInputElement).checked).toBe(true)
  }
  await userEvent.click(screen.getByRole('button', { name: 'ล้างทั้งหมด' }))
  for (const n of ['rice', 'oil', 'salt']) {
    expect((screen.getByRole('checkbox', { name: `แพ็คแล้ว: ${n}` }) as HTMLInputElement).checked).toBe(false)
  }
  // the already-packed PO's tick is untouched by clear-all
  expect((screen.getByRole('checkbox', { name: 'แพ็คแล้ว: sugar' }) as HTMLInputElement).checked).toBe(true)
})

test('plain "บันทึก" saves via savePackGroup with primary/others + only the editable ticks, and marks nothing packed', async () => {
  renderPage()
  await screen.findByText('rice')
  const piece = screen.getByLabelText(/จำนวนชิ้น/)
  await userEvent.clear(piece)
  await userEvent.type(piece, '4')
  await userEvent.type(screen.getByLabelText('ชื่อคนแพ็ค'), 'สมชาย')
  await userEvent.click(screen.getByRole('checkbox', { name: 'แพ็คแล้ว: rice' }))
  await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }))

  expect(savePackGroup).toHaveBeenCalledTimes(1)
  expect(savePackGroup.mock.calls[0][0]).toEqual({
    primaryId: 'o1',
    otherIds: ['o2'],
    paperCount: 0,
    foamCount: 0,
    pieceCount: 4,
    packerName: 'สมชาย',
    itemPacked: [
      { id: 'i1', packed: true },
      { id: 'i2', packed: false },
      { id: 'i3', packed: false },
    ],
  })
  expect(updateOrderStatus).not.toHaveBeenCalled()
})

test('"บันทึก + แพ็คเสร็จ" saves first, then marks every not-yet-packed PO packed (not the one already packed)', async () => {
  renderPage()
  await screen.findByText('rice')
  await satisfyGate()
  await userEvent.click(screen.getByRole('button', { name: 'บันทึก + แพ็คเสร็จ' }))

  await waitFor(() => expect(updateOrderStatus).toHaveBeenCalledTimes(2))
  // primary (o1) last, so a failure midway never moves the primary role
  expect(updateOrderStatus.mock.calls).toEqual([
    ['o2', 'packed'],
    ['o1', 'packed'],
  ])
  expect(savePackGroup.mock.invocationCallOrder[0]).toBeLessThan(
    updateOrderStatus.mock.invocationCallOrder[0],
  )
  expect(await screen.findByText('บันทึกและทำเครื่องหมายแพ็คเสร็จแล้ว 2 ออเดอร์')).toBeInTheDocument()
  // everything is packed now -> the page turns read-only
  expect(screen.queryByRole('button', { name: 'บันทึก + แพ็คเสร็จ' })).not.toBeInTheDocument()
  expect(screen.getByText(/ทุกออเดอร์ของลูกค้ารายนี้แพ็คแล้ว/)).toBeInTheDocument()
})

test('if a later status change fails, it reports how many POs were packed and keeps the rest retryable', async () => {
  updateOrderStatus.mockReset().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('boom'))
  renderPage()
  await screen.findByText('rice')
  await satisfyGate()
  await userEvent.click(screen.getByRole('button', { name: 'บันทึก + แพ็คเสร็จ' }))

  expect(await screen.findByText(/แพ็คเสร็จแล้ว 1\/2 ออเดอร์ แล้วเกิดข้อผิดพลาด: boom/)).toBeInTheDocument()
  // PO-2 went through, the primary PO-1 did not: PO-1 stays primary (photos/boxes
  // still recorded on it) and PO-2's line is now read-only
  await waitFor(() =>
    expect(screen.getByRole('checkbox', { name: 'แพ็คแล้ว: salt' })).toBeDisabled(),
  )
  expect(screen.getByText('photo-target:o1')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'บันทึก + แพ็คเสร็จ' })).toBeInTheDocument()
})

test('when every PO is already packed the page is read-only: no boxes form, no pack buttons', async () => {
  listOrdersForCustomerDay.mockResolvedValue(orders().map((o) => ({ ...o, status: 'packed' })))
  renderPage()
  await screen.findByText('rice')
  expect(screen.getByText(/ทุกออเดอร์ของลูกค้ารายนี้แพ็คแล้ว/)).toBeInTheDocument()
  expect(screen.queryByLabelText(/ลังกระดาษ/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'บันทึก' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'เลือกทั้งหมด' })).not.toBeInTheDocument()
})

test('a revisit seeds boxes/packer/photos from the primary PO and each line\'s saved tick', async () => {
  listOrdersForCustomerDay.mockResolvedValue([
    base(
      'o1',
      'PO-1',
      'imported',
      [item('i1', 'rice', { packed: true }), item('i2', 'oil', { packed: true })],
      {
        paper_box_count: 3,
        packer_name: 'สมชาย',
        evidence_photos: [{ id: 'e1', r2_key: 'evidence/o1/a.jpg', stage: 'pack' }],
      },
    ),
    base('o2', 'PO-2', 'imported', [item('i3', 'salt', { packed: true })]),
  ])
  renderPage()
  await screen.findByText('rice')
  expect((screen.getByLabelText(/ลังกระดาษ/) as HTMLInputElement).value).toBe('3')
  expect((screen.getByLabelText('ชื่อคนแพ็ค') as HTMLInputElement).value).toBe('สมชาย')
  expect(screen.getAllByAltText('รูปที่อัปโหลด')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'บันทึก + แพ็คเสร็จ' })).toBeEnabled()
})

test('splits ของสด / ของแห้ง across every PO once the lines carry Dept data', async () => {
  listOrdersForCustomerDay.mockResolvedValue([
    base('o1', 'PO-1', 'imported', [item('i1', 'rice', { is_fresh: false })]),
    base('o2', 'PO-2', 'imported', [item('i2', 'tomato', { is_fresh: true })]),
  ])
  renderPage()
  await screen.findByText('rice')
  expect(screen.getByText('ของสด (1)')).toBeInTheDocument()
  expect(screen.getByText('ของแห้ง (1)')).toBeInTheDocument()
})

test('carry-over backorders from every PO show together, tagged with the PO, and can be fulfilled', async () => {
  listPendingBackordersForOrder.mockImplementation(async (id: string) =>
    id === 'o2'
      ? [
          {
            id: 'b1',
            source_order_id: 's1',
            reason: 'shortage',
            product_name: 'sugar',
            qty: 4,
            target_ship_date: '2026-10-01',
            target_order_id: 'o2',
            status: 'pending',
          },
        ]
      : [],
  )
  renderPage()
  expect(await screen.findByText(/sugar x4/)).toBeInTheDocument()
  expect(screen.getByText('(PO-2)')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'ส่งแล้ว' }))
  expect(markBackorderFulfilled).toHaveBeenCalledWith('b1')
  expect(screen.queryByText(/sugar x4/)).not.toBeInTheDocument()
})

test('shows a Thai error when the customer has no orders that day, and when loading fails', async () => {
  listOrdersForCustomerDay.mockResolvedValue([])
  const { unmount } = renderPage()
  expect(await screen.findByText('ไม่พบออเดอร์ของลูกค้ารายนี้ในวันนี้')).toBeInTheDocument()
  unmount()
  listOrdersForCustomerDay.mockRejectedValue(new Error('x'))
  renderPage()
  expect(await screen.findByText('โหลดออเดอร์ไม่สำเร็จ')).toBeInTheDocument()
})
