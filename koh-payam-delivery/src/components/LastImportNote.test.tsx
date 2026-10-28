import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LastImportNote } from './LastImportNote'

const getLastImport = vi.fn()
vi.mock('../lib/api/dataImports', () => ({ getLastImport: () => getLastImport() }))

const at = (thai: string) => new Date(Date.parse(`${thai}+07:00`)).toISOString()
const renderNote = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LastImportNote />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(at('2026-10-29T12:00:00')))
})
afterEach(() => vi.useRealTimers())

test('on time: a quiet line with the last import and a link to import', async () => {
  getLastImport.mockResolvedValue(at('2026-10-29T11:00:00'))
  renderNote()
  expect(await screen.findByText(/ข้อมูลแม็คโครนำเข้าล่าสุด/)).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'นำเข้าออเดอร์' })).toHaveAttribute('href', '/import')
})

test('2 h late within work hours: a red alert saying how late', async () => {
  getLastImport.mockResolvedValue(at('2026-10-29T09:00:00'))
  renderNote()
  expect(await screen.findByRole('alert')).toHaveTextContent('ข้อมูลแม็คโครไม่ได้อัปเดตเกิน 3 ชม.')
})

test('never imported says so, without an alert', async () => {
  getLastImport.mockResolvedValue(null)
  renderNote()
  expect(await screen.findByText('ยังไม่มีประวัติการนำเข้าไฟล์แม็คโคร')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
