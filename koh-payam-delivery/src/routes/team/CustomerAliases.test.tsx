import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CustomerAliases from './CustomerAliases'

const { listCustomerAliases, saveShortName } = vi.hoisted(() => ({
  listCustomerAliases: vi.fn(),
  saveShortName: vi.fn(),
}))
vi.mock('../../lib/api/customerAliases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api/customerAliases')>()),
  listCustomerAliases,
  saveShortName,
}))

const rows = [
  { key: 'phone:0826289533', name: 'JJ Payam', phone: '0826289533', shortName: 'JJ', lastShipDate: '2026-09-20' },
  { key: 'name:SUNSET', name: 'Sunset Bungalow', phone: null, shortName: null, lastShipDate: '2026-09-10' },
]

beforeEach(() => {
  listCustomerAliases.mockReset().mockResolvedValue(rows)
  saveShortName.mockReset().mockResolvedValue(undefined)
})

test('lists customers with their short name; unset ones are flagged and countable', async () => {
  render(<CustomerAliases />)
  expect(await screen.findByDisplayValue('JJ')).toBeInTheDocument()
  expect(screen.getByText('ยังไม่ได้ตั้ง')).toBeInTheDocument()
  await userEvent.click(screen.getByLabelText(/เฉพาะที่ยังไม่ได้ตั้ง \(1\)/))
  expect(screen.queryByText('JJ Payam')).not.toBeInTheDocument()
  expect(screen.getByText('Sunset Bungalow')).toBeInTheDocument()
})

test('search matches name, phone or short name', async () => {
  render(<CustomerAliases />)
  await screen.findByText('JJ Payam')
  await userEvent.type(screen.getByPlaceholderText(/ค้นหา/), '0826')
  expect(screen.getByText('JJ Payam')).toBeInTheDocument()
  expect(screen.queryByText('Sunset Bungalow')).not.toBeInTheDocument()
})

test('setting a name saves it for that customer and clears the "not set" flag', async () => {
  render(<CustomerAliases />)
  const input = await screen.findByLabelText('ชื่อย่อของ Sunset Bungalow')
  const row = input.closest('tr')!
  expect(within(row).getByRole('button', { name: 'บันทึก' })).toBeDisabled() // nothing typed yet
  await userEvent.type(input, 'ซันเซ็ต')
  await userEvent.click(within(row).getByRole('button', { name: 'บันทึก' }))
  await waitFor(() =>
    expect(saveShortName).toHaveBeenCalledWith(
      { customer_phone: null, customer_name_en: 'Sunset Bungalow' },
      'ซันเซ็ต',
    ),
  )
  expect(within(row).getByText('บันทึกแล้ว')).toBeInTheDocument()
  expect(within(row).queryByText('ยังไม่ได้ตั้ง')).not.toBeInTheDocument()
})
