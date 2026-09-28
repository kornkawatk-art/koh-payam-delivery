import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StickerPrintButton } from './StickerPrint'

const { getShortName, saveShortName } = vi.hoisted(() => ({
  getShortName: vi.fn(),
  saveShortName: vi.fn(),
}))
vi.mock('../lib/api/customerAliases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api/customerAliases')>()),
  getShortName,
  saveShortName,
}))

const customer = { customer_phone: '0826289533', customer_name_en: 'JJ Payam' }
const counts = { paper: 2, foam: 1, piece: 0 }
const printSpy = vi.fn()

beforeEach(() => {
  getShortName.mockReset().mockResolvedValue(null)
  saveShortName.mockReset().mockResolvedValue(undefined)
  printSpy.mockReset()
  window.print = printSpy
})
afterEach(() => document.body.classList.remove('printing-stickers'))

const open = async (props = {}) => {
  render(<StickerPrintButton customer={customer} counts={counts} {...props} />)
  await userEvent.click(screen.getByRole('button', { name: 'พิมพ์สติ๊กเกอร์ (3 ดวง)' }))
  return screen.getByRole('dialog', { name: 'พิมพ์สติ๊กเกอร์' })
}

test('the button counts one sticker per box/piece and is disabled with nothing to print', () => {
  const { rerender } = render(<StickerPrintButton customer={customer} counts={counts} />)
  expect(screen.getByRole('button', { name: 'พิมพ์สติ๊กเกอร์ (3 ดวง)' })).toBeEnabled()
  rerender(<StickerPrintButton customer={customer} counts={{ paper: 0, foam: 0, piece: 0 }} />)
  expect(screen.getByRole('button', { name: 'พิมพ์สติ๊กเกอร์ (0 ดวง)' })).toBeDisabled()
})

test('no saved short name yet: suggests the first word of the customer name', async () => {
  await open()
  expect(await screen.findByDisplayValue('JJ')).toBeInTheDocument()
})

test('a saved short name is used as-is', async () => {
  getShortName.mockResolvedValue('แจ๊ะ')
  await open()
  expect(await screen.findByDisplayValue('แจ๊ะ')).toBeInTheDocument()
})

test('printing all: saves the name for next time, runs beforePrint, then prints one sticker per box numbered 1..N', async () => {
  const beforePrint = vi.fn().mockResolvedValue(undefined)
  const dialog = await open({ beforePrint })
  const name = await screen.findByDisplayValue('JJ')
  await userEvent.clear(name)
  await userEvent.type(name, 'JJ2')
  await userEvent.click(within(dialog).getByRole('button', { name: 'พิมพ์' }))

  await waitFor(() => expect(printSpy).toHaveBeenCalled())
  expect(saveShortName).toHaveBeenCalledWith(customer, 'JJ2')
  expect(beforePrint).toHaveBeenCalled()
  const root = screen.getByTestId('sticker-print-root')
  const faces = root.querySelectorAll('.sticker')
  expect(faces).toHaveLength(3)
  expect(faces[0]).toHaveTextContent('JJ2')
  expect(faces[0]).toHaveTextContent('1 / 3 · ลังกระดาษ')
  expect(faces[2]).toHaveTextContent('3 / 3 · ลังโฟม')
  expect(document.body).toHaveClass('printing-stickers')
})

test('reprinting some: only the chosen numbers; an invalid choice is explained and nothing prints', async () => {
  const dialog = await open()
  await screen.findByDisplayValue('JJ')
  await userEvent.click(within(dialog).getByLabelText(/เฉพาะบางดวง/))
  const pick = within(dialog).getByLabelText('เลขดวงที่จะพิมพ์')

  await userEvent.type(pick, '9')
  await userEvent.click(within(dialog).getByRole('button', { name: 'พิมพ์' }))
  expect(within(dialog).getByRole('alert')).toHaveTextContent('มีทั้งหมด 3 ดวง')
  expect(printSpy).not.toHaveBeenCalled()

  await userEvent.clear(pick)
  await userEvent.type(pick, '2')
  await userEvent.click(within(dialog).getByRole('button', { name: 'พิมพ์' }))
  await waitFor(() => expect(printSpy).toHaveBeenCalled())
  const faces = screen.getByTestId('sticker-print-root').querySelectorAll('.sticker')
  expect(faces).toHaveLength(1)
  expect(faces[0]).toHaveTextContent('2 / 3 · ลังกระดาษ')
})

test('a blank name cannot be printed', async () => {
  const dialog = await open()
  await userEvent.clear(await screen.findByDisplayValue('JJ'))
  expect(within(dialog).getByRole('button', { name: 'พิมพ์' })).toBeDisabled()
})
