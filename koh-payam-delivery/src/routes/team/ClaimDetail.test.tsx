import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ClaimDetail from './ClaimDetail'

const getClaim = vi.fn()
const resolveClaim = vi.fn().mockResolvedValue(undefined)
const eviQuery = vi.fn()

vi.mock('../../lib/api/claims', () => ({
  getClaim: (...a: unknown[]) => getClaim(...a),
  resolveClaim: (...a: unknown[]) => resolveClaim(...a),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (...a: unknown[]) => eviQuery(...a),
      }),
    }),
  },
}))

const claim = {
  id: 'c1',
  order_id: 'o1',
  type: 'damaged',
  qty: 2,
  description: 'ข้าวสารเปียก',
  orders: { makro_order_no: 'PO-1', customer_name_en: 'BLUE VIEW' },
  order_items: { product_name: 'rice' },
  claim_photos: [],
}

beforeEach(() => {
  getClaim.mockReset().mockResolvedValue(claim)
  resolveClaim.mockClear().mockResolvedValue(undefined)
  eviQuery.mockReset().mockResolvedValue({ data: [], error: null })
})

const renderPage = () =>
  render(
    <MemoryRouter
      initialEntries={['/claims/c1']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/claims/:id" element={<ClaimDetail />} />
        <Route path="/claims" element={<div>claims queue</div>} />
      </Routes>
    </MemoryRouter>,
  )

test('leaves the refund amount empty for the team to type', async () => {
  renderPage()
  expect(await screen.findByLabelText('จำนวนเงินคืน')).toHaveValue(null)
})

test('switching to resend hides the amount field and resolves without a refund', async () => {
  renderPage()
  await screen.findByLabelText('จำนวนเงินคืน')
  await userEvent.click(screen.getByLabelText('ส่งชดเชยวันถัดไป'))
  expect(screen.queryByLabelText('จำนวนเงินคืน')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'บันทึกผล' }))
  expect(resolveClaim).toHaveBeenCalledWith('c1', {
    decision: 'approved',
    resolution: 'resend_next_day',
    refundAmount: undefined,
    note: undefined,
  })
  expect(await screen.findByText('claims queue')).toBeInTheDocument()
})

test('a refund resolution with no typed amount passes 0 through', async () => {
  renderPage()
  await screen.findByLabelText('จำนวนเงินคืน')
  await userEvent.click(screen.getByRole('button', { name: 'บันทึกผล' }))
  expect(resolveClaim).toHaveBeenCalledWith('c1', {
    decision: 'approved',
    resolution: 'refund',
    refundAmount: 0,
    note: undefined,
  })
})

test('rejecting sends no resolution and no refund amount', async () => {
  renderPage()
  await screen.findByLabelText('จำนวนเงินคืน')
  await userEvent.click(screen.getByLabelText('ปฏิเสธ'))
  await userEvent.click(screen.getByRole('button', { name: 'บันทึกผล' }))
  expect(resolveClaim).toHaveBeenCalledWith('c1', {
    decision: 'rejected',
    resolution: undefined,
    refundAmount: undefined,
    note: undefined,
  })
})

test('passes a typed note through to resolveClaim', async () => {
  renderPage()
  await screen.findByLabelText('จำนวนเงินคืน')
  await userEvent.type(screen.getByPlaceholderText('โน้ต (ไม่บังคับ)'), 'ตรวจแล้ว')
  await userEvent.click(screen.getByRole('button', { name: 'บันทึกผล' }))
  expect(resolveClaim).toHaveBeenCalledWith('c1', {
    decision: 'approved',
    resolution: 'refund',
    refundAmount: 0,
    note: 'ตรวจแล้ว',
  })
})

test('sends an edited refund amount through as a number', async () => {
  renderPage()
  const amt = await screen.findByLabelText('จำนวนเงินคืน')
  await userEvent.clear(amt)
  await userEvent.type(amt, '150')
  await userEvent.click(screen.getByRole('button', { name: 'บันทึกผล' }))
  expect(resolveClaim).toHaveBeenCalledWith('c1', {
    decision: 'approved',
    resolution: 'refund',
    refundAmount: 150,
    note: undefined,
  })
})

test('an invalid refund amount is coerced to 0 before resolving', async () => {
  renderPage()
  const amt = await screen.findByLabelText('จำนวนเงินคืน')
  await userEvent.clear(amt)
  await userEvent.type(amt, '-5')
  await userEvent.click(screen.getByRole('button', { name: 'บันทึกผล' }))
  expect(resolveClaim).toHaveBeenCalledWith('c1', {
    decision: 'approved',
    resolution: 'refund',
    refundAmount: 0,
    note: undefined,
  })
})

test('a resolveClaim failure shows a Thai error and does not navigate', async () => {
  resolveClaim.mockReset().mockRejectedValueOnce(
    new Error('บันทึกผลเคลมแล้ว แต่สร้างรายการส่งชดเชยไม่สำเร็จ กรุณาสร้างด้วยตนเอง: boom'),
  )
  renderPage()
  await screen.findByLabelText('จำนวนเงินคืน')
  await userEvent.click(screen.getByRole('button', { name: 'บันทึกผล' }))
  expect(await screen.findByText(/สร้างรายการส่งชดเชยไม่สำเร็จ/)).toBeInTheDocument()
  expect(screen.queryByText('claims queue')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'บันทึกผล' })).not.toBeDisabled()
})

test('an evidence-photo fetch failure does not blank the loaded claim', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  eviQuery.mockReset().mockRejectedValue(new Error('boom'))
  renderPage()
  expect(await screen.findByLabelText('จำนวนเงินคืน')).toBeInTheDocument()
  expect(screen.queryByText('โหลดเคลมไม่สำเร็จ')).not.toBeInTheDocument()
  expect(warn).toHaveBeenCalled()
  warn.mockRestore()
})

test('renders a Thai error instead of a permanent spinner when the claim fails to load', async () => {
  getClaim.mockReset().mockRejectedValueOnce(new Error('nope'))
  renderPage()
  expect(await screen.findByText('โหลดเคลมไม่สำเร็จ')).toBeInTheDocument()
})
