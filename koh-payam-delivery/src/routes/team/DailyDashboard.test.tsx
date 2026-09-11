import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DailyDashboard from './DailyDashboard'
import { listOrdersForDay } from '../../lib/api/shipDays'

vi.mock('../../lib/api/shipDays', () => ({
  listOrdersForDay: vi.fn().mockResolvedValue([
    {
      id: '1',
      makro_order_no: 'PO-1',
      customer_name_en: 'BLUE VIEW',
      status: 'packed',
      boat_id: null,
      paper_box_count: 2,
      foam_box_count: 0,
      outstanding_amount: 6172.5,
    },
    {
      id: '2',
      makro_order_no: 'PO-2',
      customer_name_en: 'PAYAM CAFE',
      status: 'packed',
      boat_id: null,
      paper_box_count: 1,
      foam_box_count: 1,
      outstanding_amount: null,
    },
    {
      id: '3',
      makro_order_no: 'PO-3',
      customer_name_en: 'SUNSET',
      status: 'shipped',
      boat_id: '1',
      paper_box_count: 3,
      foam_box_count: 0,
      outstanding_amount: 0,
    },
  ]),
}))

const listBackordersForDay = vi.fn().mockResolvedValue([])
vi.mock('../../lib/api/backorders', () => ({
  listBackordersForDay: (...a: unknown[]) => listBackordersForDay(...a),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), unsubscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}))

const renderPage = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <DailyDashboard />
    </MemoryRouter>,
  )

test('summarises status progress for the day', async () => {
  renderPage()
  expect(
    await screen.findByText('แพ็คแล้ว 3/3 · ถึงท่าเรือ 1 · ส่งแล้ว 1'),
  ).toBeInTheDocument()
})

test('search filters rows client-side by customer name', async () => {
  renderPage()
  await screen.findByText('BLUE VIEW')
  await userEvent.type(
    screen.getByPlaceholderText(/ค้นหาชื่อลูกค้า/),
    'BLUE',
  )
  expect(screen.getByText('BLUE VIEW')).toBeInTheDocument()
  expect(screen.queryByText('PAYAM CAFE')).not.toBeInTheDocument()
  expect(screen.queryByText('SUNSET')).not.toBeInTheDocument()
})

test('order number links through to the order detail route', async () => {
  renderPage()
  const link = await screen.findByRole('link', { name: 'PO-1' })
  expect(link).toHaveAttribute('href', '/order/1')
})

test('shows a pending-backorder banner linking to the destination order', async () => {
  listBackordersForDay.mockResolvedValueOnce([
    {
      id: 'b1',
      source_order_id: 's1',
      reason: 'shortage',
      product_name: 'rice',
      qty: 2,
      target_ship_date: '2026-10-01',
      target_order_id: '1',
      status: 'pending',
    },
  ])
  renderPage()
  expect(await screen.findByText('ของค้างส่ง 1 รายการรอส่งวันนี้')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /rice x2/ })).toHaveAttribute('href', '/order/1')
})

test('shows a เก็บเงิน badge only on rows with outstanding_amount > 0', async () => {
  renderPage()
  await screen.findByText('BLUE VIEW')
  const row1 = screen.getByText('PO-1').closest('tr')!
  const row2 = screen.getByText('PO-2').closest('tr')!
  const row3 = screen.getByText('PO-3').closest('tr')!
  expect(within(row1).getByText('เก็บเงิน')).toBeInTheDocument()
  expect(within(row2).queryByText('เก็บเงิน')).not.toBeInTheDocument()
  expect(within(row3).queryByText('เก็บเงิน')).not.toBeInTheDocument()
})

test('load fails → Thai error + retry re-invokes the loader', async () => {
  vi.mocked(listOrdersForDay).mockRejectedValueOnce(new Error('nope'))
  renderPage()
  await screen.findByText('โหลดงานวันนี้ไม่สำเร็จ')
  const callsBefore = vi.mocked(listOrdersForDay).mock.calls.length

  await userEvent.click(screen.getByRole('button', { name: 'ลองใหม่' }))

  await waitFor(() =>
    expect(vi.mocked(listOrdersForDay).mock.calls.length).toBeGreaterThan(callsBefore),
  )
  expect(await screen.findByText('BLUE VIEW')).toBeInTheDocument()
})
