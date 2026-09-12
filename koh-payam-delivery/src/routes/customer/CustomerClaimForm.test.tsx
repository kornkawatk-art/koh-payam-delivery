import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CustomerClaimForm from './CustomerClaimForm'

const fetchMock = vi.fn()

// Stub PhotoCapture: a button that reports one uploaded key, plus two buttons
// to simulate the onBusyChange callback firing while a photo is in flight.
vi.mock('../../components/PhotoCapture', () => ({
  default: ({
    onUploaded,
    onBusyChange,
  }: {
    onUploaded: (k: string) => void
    onBusyChange?: (busy: boolean) => void
  }) => (
    <>
      <button type="button" onClick={() => onUploaded('k1')}>
        mock-upload
      </button>
      <button type="button" onClick={() => onBusyChange?.(true)}>
        mock-photo-busy
      </button>
      <button type="button" onClick={() => onBusyChange?.(false)}>
        mock-photo-idle
      </button>
    </>
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
    items: [{ orderItemIndex: 0, qty: 1 }],
  })
  expect(body.photoKeys).toContain('k1')
})

test('box_lost hides the item picker and sends an empty items array', async () => {
  const onDone = vi.fn()
  render(<CustomerClaimForm token="tok_abc" items={items} lang="en" onDone={onDone} />)

  await userEvent.click(screen.getByRole('radio', { name: 'Box lost' }))
  expect(screen.queryByLabelText('Item')).not.toBeInTheDocument()
  expect(screen.queryByText('Which items are missing?')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(onDone).toHaveBeenCalled())

  const body = lastBody()
  expect(body.type).toBe('box_lost')
  expect(body.items).toEqual([])
})

test('missing_in_box: checking two items with qtys POSTs one items[] entry each', async () => {
  const onDone = vi.fn()
  render(<CustomerClaimForm token="tok_abc" items={items} lang="en" onDone={onDone} />)

  // missing_in_box is the default type
  expect(screen.getByText('Which items are missing?')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('checkbox', { name: 'Rice 5kg' }))
  await userEvent.click(screen.getByRole('checkbox', { name: 'Fish sauce' }))

  const riceQty = screen.getByLabelText('Quantity: Rice 5kg')
  // onFocus selects the current value (default 1), so typing over it replaces
  // rather than appends.
  await userEvent.click(riceQty)
  await userEvent.keyboard('3')

  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(onDone).toHaveBeenCalled())

  const body = lastBody()
  expect(body.type).toBe('missing_in_box')
  expect(body.items).toEqual([
    { orderItemIndex: 0, qty: 3 },
    { orderItemIndex: 1, qty: 1 },
  ])
})

test('missing_in_box: unchecking an item removes its qty input and drops it from items[]', async () => {
  const onDone = vi.fn()
  render(<CustomerClaimForm token="tok_abc" items={items} lang="en" onDone={onDone} />)

  await userEvent.click(screen.getByRole('checkbox', { name: 'Rice 5kg' }))
  await userEvent.click(screen.getByRole('checkbox', { name: 'Fish sauce' }))
  expect(screen.getByLabelText('Quantity: Rice 5kg')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('checkbox', { name: 'Rice 5kg' }))
  expect(screen.queryByLabelText('Quantity: Rice 5kg')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(onDone).toHaveBeenCalled())

  const body = lastBody()
  expect(body.items).toEqual([{ orderItemIndex: 1, qty: 1 }])
})

test('missing_in_box: submit is disabled until at least one item is checked', async () => {
  render(<CustomerClaimForm token="tok_abc" items={items} lang="en" onDone={vi.fn()} />)

  expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  await userEvent.click(screen.getByRole('checkbox', { name: 'Rice 5kg' }))
  expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled()
  await userEvent.click(screen.getByRole('checkbox', { name: 'Rice 5kg' }))
  expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
})

test('qty inputs select their contents on focus so the default 1 is easy to overwrite', async () => {
  render(<CustomerClaimForm token="tok_abc" items={items} lang="en" onDone={vi.fn()} />)
  await userEvent.click(screen.getByRole('checkbox', { name: 'Rice 5kg' }))
  const riceQty = screen.getByLabelText('Quantity: Rice 5kg') as HTMLInputElement
  await userEvent.click(riceQty)
  await userEvent.keyboard('9')
  // select-all-on-focus means the typed digit replaces the previous value
  // rather than appending to it.
  expect(riceQty.value).toBe('9')
})

test('submit is blocked while a photo is still uploading, with a hint', async () => {
  const onDone = vi.fn()
  render(<CustomerClaimForm token="tok_abc" items={items} lang="en" onDone={onDone} />)

  await userEvent.click(screen.getByRole('checkbox', { name: 'Rice 5kg' }))
  await userEvent.click(screen.getByRole('button', { name: 'mock-photo-busy' }))
  expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  expect(screen.getByText('Uploading photo, please wait…')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'mock-photo-idle' }))
  expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled()
  expect(onDone).not.toHaveBeenCalled()
})

test('a failed submit surfaces a translated error and does not call onDone', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ error: 'ส่งเรื่องไม่สำเร็จ' }),
  })
  const onDone = vi.fn()
  render(<CustomerClaimForm token="tok_abc" items={items} lang="en" onDone={onDone} />)

  await userEvent.click(screen.getByRole('checkbox', { name: 'Rice 5kg' }))
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

  expect(
    await screen.findByText('Could not submit your report. Please try again.'),
  ).toBeInTheDocument()
  expect(onDone).not.toHaveBeenCalled()
})
