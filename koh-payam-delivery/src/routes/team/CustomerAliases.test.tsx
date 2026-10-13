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

const rowOf = async (name: string) => (await screen.findByText(name)).closest('li') as HTMLElement

test('summary: how many are set out of all, and how many still missing (amber)', async () => {
  render(<CustomerAliases />)
  const summary = await screen.findByRole('region', { name: 'สรุปชื่อย่อ' })
  expect(within(summary).getByText('ตั้งแล้ว').closest('div')).toHaveTextContent('1 / 2 ราย')
  const missing = within(summary).getByText('ยังไม่ได้ตั้ง').closest('div')!
  expect(missing).toHaveTextContent('1 ราย')
  expect(missing).toHaveClass('bg-warn-soft')
})

test('opens on the customers still missing a name; tabs switch to set and all', async () => {
  render(<CustomerAliases />)
  await screen.findByText('Sunset Bungalow')
  expect(screen.queryByText('JJ Payam')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /^ตั้งแล้ว/ }))
  expect(screen.getByText('JJ Payam')).toBeInTheDocument()
  expect(screen.queryByText('Sunset Bungalow')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /^ทั้งหมด/ }))
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
})

test('a set name shows like the sticker label', async () => {
  render(<CustomerAliases />)
  await userEvent.click(await screen.findByRole('button', { name: /^ตั้งแล้ว/ }))
  expect(within(await rowOf('JJ Payam')).getByText('JJ')).toHaveClass('sticker-chip')
})

test('one tap uses the suggested name', async () => {
  render(<CustomerAliases />)
  const row = await rowOf('Sunset Bungalow')
  await userEvent.click(within(row).getByRole('button', { name: 'ใช้ “Sunset”' }))
  await waitFor(() =>
    expect(saveShortName).toHaveBeenCalledWith({ customer_phone: null, customer_name_en: 'Sunset Bungalow' }, 'Sunset'),
  )
  expect(await screen.findByText('ตั้งชื่อย่อ Sunset Bungalow เป็น “Sunset” แล้ว')).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'สรุปชื่อย่อ' })).getByText('ตั้งแล้ว').closest('div')).toHaveTextContent(
    '2 / 2 ราย',
  )
})

test('typing a name: editor with suggestions and a sticker preview, save only when changed', async () => {
  render(<CustomerAliases />)
  const row = await rowOf('Sunset Bungalow')
  await userEvent.click(within(row).getByRole('button', { name: 'พิมพ์เอง' }))
  const input = within(row).getByLabelText('ชื่อย่อของ Sunset Bungalow')
  expect(within(row).getByRole('button', { name: 'บันทึก' })).toBeDisabled() // nothing typed yet
  await userEvent.type(input, 'ซันเซ็ต')
  expect(within(row).getByLabelText('ตัวอย่างบนสติ๊กเกอร์')).toHaveTextContent('ซันเซ็ต')
  await userEvent.click(within(row).getByRole('button', { name: 'บันทึก' }))
  await waitFor(() =>
    expect(saveShortName).toHaveBeenCalledWith({ customer_phone: null, customer_name_en: 'Sunset Bungalow' }, 'ซันเซ็ต'),
  )
})

test('a suggestion button fills the box', async () => {
  render(<CustomerAliases />)
  await userEvent.click(await screen.findByRole('button', { name: /^ตั้งแล้ว/ }))
  const row = await rowOf('JJ Payam')
  await userEvent.click(within(row).getByRole('button', { name: 'แก้' }))
  await userEvent.click(within(row).getByRole('button', { name: 'JJ Payam' }))
  expect(within(row).getByLabelText('ชื่อย่อของ JJ Payam')).toHaveValue('JJ Payam')
})

test('search matches name, phone or short name', async () => {
  render(<CustomerAliases />)
  await userEvent.click(await screen.findByRole('button', { name: /^ทั้งหมด/ }))
  await userEvent.type(screen.getByPlaceholderText(/ค้นหา/), '0826')
  expect(screen.getByText('JJ Payam')).toBeInTheDocument()
  expect(screen.queryByText('Sunset Bungalow')).not.toBeInTheDocument()
})

test('a failed save shows a Thai error and keeps the row', async () => {
  saveShortName.mockRejectedValue(new Error('บันทึกชื่อย่อไม่สำเร็จ'))
  render(<CustomerAliases />)
  const row = await rowOf('Sunset Bungalow')
  await userEvent.click(within(row).getByRole('button', { name: 'ใช้ “Sunset”' }))
  expect(await screen.findByText('บันทึกชื่อย่อไม่สำเร็จ')).toBeInTheDocument()
  expect(screen.getByText('Sunset Bungalow')).toBeInTheDocument()
})
