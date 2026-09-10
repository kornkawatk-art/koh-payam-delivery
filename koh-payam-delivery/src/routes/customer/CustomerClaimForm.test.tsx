import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CustomerClaimForm from './CustomerClaimForm'

const fetchMock = vi.fn()

// Stub PhotoCapture: a button that reports one uploaded key.
vi.mock('../../components/PhotoCapture', () => ({
  default: ({ onUploaded }: { onUploaded: (k: string) => void }) => (
    <button type="button" onClick={() => onUploaded('k1')}>
      mock-upload
    </button>
  ),
}))

const items = [
  { productName: 'Rice 5kg', qtyOrdered: 10 },
  { productName: 'Fish sauce', qtyOrdered: 4 },
]

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ok: true, claimId: 'c1' }),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
const lastBody = () => JSON.parse((lastCall()[1] as RequestInit).body as string)

test('damaged + first item + qty + description + photo -> POSTs to submit-claim', async () => {
  const onDone = vi.fn()
  render(<CustomerClaimForm token="tok_abc" items={items} lang="en" onDone={onDone} />)

  await userEvent.click(screen.getByRole('radio', { name: 'Damaged' }))
  // first item (index 0) is the default <select> value
  expect((screen.getByLabelText('Item') as HTMLSelectElement).value).toBe('0')
  await userEvent.type(screen.getByLabelText('Description'), 'crushed tin')
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

  await waitFor(() => expect(onDone).toHaveBeenCalled())

  const [url, init] = lastCall()
  expect(String(url)).toContain('/functions/v1/submit-claim')
  expect((init as RequestInit).method).toBe('POST')
  expect((init as RequestInit).headers).toMatchObject({
    'Content-Type': 'application/json',
    Authorization: expect.stringMatching(/^Bearer /),
  })
  const body = lastBody()
  expect(body).toMatchObject({
    token: 'tok_abc',
    type: 'damaged',
    orderItemIndex: 0,
    qty: 1,
  })
  expect(body.photoKeys).toContain('k1')
})

test('box_lost hides the item <select> and sends no orderItemIndex', async () => {
  const onDone = vi.fn()
  render(<CustomerClaimForm token="tok_abc" items={items} lang="en" onDone={onDone} />)

  await userEvent.click(screen.getByRole('radio', { name: 'Box lost' }))
  expect(screen.queryByLabelText('Item')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(onDone).toHaveBeenCalled())

  const body = lastBody()
  expect(body.type).toBe('box_lost')
  expect(body.orderItemIndex == null).toBe(true)
})

test('a failed submit surfaces a translated error and does not call onDone', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ error: 'ส่งเรื่องไม่สำเร็จ' }),
  })
  const onDone = vi.fn()
  render(<CustomerClaimForm token="tok_abc" items={items} lang="en" onDone={onDone} />)

  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

  expect(
    await screen.findByText('Could not submit your report. Please try again.'),
  ).toBeInTheDocument()
  expect(onDone).not.toHaveBeenCalled()
})
