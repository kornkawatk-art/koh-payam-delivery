import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CustomerOrderView from './CustomerOrderView'

const fetchMock = vi.fn()

const payload = {
  orderNo: 'PO-1001',
  customerNameEn: 'BLUE VIEW RESORT',
  shipDate: '2026-09-10',
  status: 'shipped',
  boatName: 'เรือ 2',
  siblingOrders: [],
  paperBoxCount: 3,
  foamBoxCount: 1,
  pieceCount: 2,
  items: [
    { productName: 'Rice 5kg', itemId: '100001', orderedQty: 10, shippedQty: 10, isShort: false },
    { productName: 'Fish sauce', itemId: '100002', orderedQty: 4, shippedQty: 2, isShort: true },
  ],
  shortages: [{ productName: 'Fish sauce', orderedQty: 4, shippedQty: 2 }],
  evidencePhotos: ['https://pub.example/evidence/a.jpg'],
  claimDeadlineAt: '2026-09-12T09:00:00.000Z',
  canClaim: true,
  claims: [],
  outstandingAmount: null,
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body) })

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockResolvedValue(ok(payload))
  try {
    localStorage.removeItem('cust_lang')
  } catch {
    /* ignore */
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const renderAt = (token = 'tok_abc') =>
  render(
    <MemoryRouter
      initialEntries={[`/o/${token}`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/o/:token" element={<CustomerOrderView />} />
      </Routes>
    </MemoryRouter>,
  )

test('fetches order-view with the token and the anon bearer header', async () => {
  renderAt('tok_abc')
  await screen.findByText(/PO-1001/)
  const [url, init] = fetchMock.mock.calls[0]
  expect(String(url)).toContain('/functions/v1/order-view?token=tok_abc')
  expect((init as RequestInit).headers).toMatchObject({
    Authorization: expect.stringMatching(/^Bearer /),
  })
})

test('renders the shortage line and the report-a-problem button', async () => {
  renderAt()
  expect(await screen.findByText(/shipped 2 of 4/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Report a problem' })).toBeInTheDocument()
})

test('shows the makro item code per line item', async () => {
  renderAt()
  await screen.findByText('Rice 5kg')
  expect(screen.getByText('100001')).toBeInTheDocument()
  expect(screen.getByText('100002')).toBeInTheDocument()
})

test('language toggle switches the header text to Thai and persists', async () => {
  renderAt()
  expect(await screen.findByText(/Order · PO-1001/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'ไทย' }))
  expect(await screen.findByText(/ออเดอร์ · PO-1001/)).toBeInTheDocument()
  expect(localStorage.getItem('cust_lang')).toBe('th')
})

test('shows the box/piece counts line, including pieces', async () => {
  renderAt()
  expect(
    await screen.findByText('Boxes: Paper boxes 3 · Foam boxes 1 · Pieces 2'),
  ).toBeInTheDocument()
})

test('shows the amount-due line when outstandingAmount is positive', async () => {
  fetchMock.mockReset().mockResolvedValue(ok({ ...payload, outstandingAmount: 6172.5 }))
  renderAt()
  expect(await screen.findByText('Amount due on delivery: ฿6,172.50')).toBeInTheDocument()
})

test('hides the amount-due line when outstandingAmount is null', async () => {
  renderAt()
  await screen.findByText(/PO-1001/)
  expect(screen.queryByText(/Amount due on delivery/)).not.toBeInTheDocument()
})

test('a 404 shows a friendly not-found message, not a spinner', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: () => Promise.resolve({}) })
  renderAt('bad')
  expect(
    await screen.findByText('This order link was not found or has expired.'),
  ).toBeInTheDocument()
  expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
})

test('shows the related-orders section with translated status and a link when there are siblings', async () => {
  fetchMock.mockReset().mockResolvedValue(
    ok({
      ...payload,
      siblingOrders: [
        { orderNo: 'PO-1002', status: 'packed', token: 'tok_sib1' },
        { orderNo: 'PO-1003', status: 'at_pier', token: 'tok_sib2' },
      ],
    }),
  )
  renderAt()
  expect(await screen.findByText('You have 2 more order(s) today')).toBeInTheDocument()
  expect(screen.getByText('PO-1002 · Packed')).toBeInTheDocument()
  expect(screen.getByText('PO-1003 · At the pier')).toBeInTheDocument()
  const links = screen.getAllByRole('link', { name: 'View' })
  expect(links[0]).toHaveAttribute('href', '/o/tok_sib1')
  expect(links[1]).toHaveAttribute('href', '/o/tok_sib2')
})

test('hides the related-orders section when there are no siblings', async () => {
  renderAt()
  await screen.findByText(/PO-1001/)
  expect(screen.queryByText(/more order\(s\) today/)).not.toBeInTheDocument()
})

test('opens the claim form stub when report-a-problem is clicked', async () => {
  renderAt()
  await userEvent.click(await screen.findByRole('button', { name: 'Report a problem' }))
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Report a problem' })).not.toBeInTheDocument(),
  )
})

test('renders each claim item as product × qty for a multi-item claim', async () => {
  fetchMock.mockReset().mockResolvedValue(
    ok({
      ...payload,
      claims: [
        {
          id: 'c1',
          type: 'missing_in_box',
          items: [
            { productName: 'Rice 5kg', qty: 2 },
            { productName: 'Fish sauce', qty: 1 },
          ],
          description: '',
          status: 'open',
          resolution: null,
          createdAt: '2026-09-10T00:00:00.000Z',
        },
      ],
    }),
  )
  renderAt()
  await screen.findByText(/PO-1001/)
  expect(document.body.textContent).toContain('Rice 5kg × 2')
  expect(document.body.textContent).toContain('Fish sauce × 1')
})

test('renders a claim with no items (box_lost) with no item line', async () => {
  fetchMock.mockReset().mockResolvedValue(
    ok({
      ...payload,
      claims: [
        {
          id: 'c2',
          type: 'box_lost',
          items: [],
          description: '',
          status: 'open',
          resolution: null,
          createdAt: '2026-09-10T00:00:00.000Z',
        },
      ],
    }),
  )
  renderAt()
  expect(await screen.findByText(/Box lost/)).toBeInTheDocument()
  expect(screen.queryByText(/×/)).not.toBeInTheDocument()
})
