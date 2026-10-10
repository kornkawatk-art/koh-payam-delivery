import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import AppShell from './AppShell'

const useAppUpdate = vi.fn().mockReturnValue(false)
vi.mock('../lib/useAppUpdate', () => ({ useAppUpdate: () => useAppUpdate() }))

const role = { current: 'packer' }
vi.mock('../lib/auth', () => ({
  useAuth: () => ({ profile: { name: 'ก', role: role.current }, signOut: vi.fn() }),
}))

const useNavCounts = vi.fn().mockReturnValue({})
vi.mock('../lib/useNavCounts', () => ({ useNavCounts: () => useNavCounts() }))

beforeEach(() => {
  role.current = 'packer'
  useNavCounts.mockReturnValue({})
})

test('packer sees dashboard but not claims queue', () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppShell />
    </MemoryRouter>,
  )
  expect(screen.getByText('งานวันนี้')).toBeInTheDocument()
  expect(screen.queryByText('คิวเคลม')).not.toBeInTheDocument()
})

test('no update banner while the app is up to date', () => {
  useAppUpdate.mockReturnValue(false)
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppShell />
    </MemoryRouter>,
  )
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('shows a refresh banner when a newer build is available, and the button reloads the page', async () => {
  useAppUpdate.mockReturnValue(true)
  const reload = vi.fn()
  vi.stubGlobal('location', { ...window.location, reload })
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppShell />
    </MemoryRouter>,
  )
  expect(screen.getByRole('alert')).toHaveTextContent('มีเวอร์ชันใหม่ของแอป')
  await userEvent.click(screen.getByRole('button', { name: 'รีเฟรช' }))
  expect(reload).toHaveBeenCalled()
  vi.unstubAllGlobals()
  useAppUpdate.mockReturnValue(false)
})

const renderShell = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppShell />
    </MemoryRouter>,
  )

test('menu items carry their outstanding count; a zero count shows nothing', () => {
  role.current = 'manager'
  useNavCounts.mockReturnValue({ '/': 5, '/claims': 2 })
  renderShell()
  expect(screen.getByRole('link', { name: /งานวันนี้/ })).toHaveTextContent('5')
  expect(screen.getByRole('link', { name: /คิวเคลม/ })).toHaveTextContent('2')
  expect(screen.getByLabelText('ค้าง 2')).toHaveClass('bg-danger') // a decision -> red
  expect(screen.getByLabelText('ค้าง 5')).not.toHaveClass('bg-danger') // routine -> grey
  expect(screen.getByRole('link', { name: /ที่ท่าเรือ/ })).not.toHaveTextContent(/\d/)
})

test('the mobile menu button gets a dot only for decisions waiting (claims / LINE)', () => {
  role.current = 'manager'
  useNavCounts.mockReturnValue({ '/': 5, '/pier': 3 })
  const { unmount } = renderShell()
  expect(screen.getByRole('button', { name: 'เมนู' })).toBeInTheDocument()
  unmount()

  useNavCounts.mockReturnValue({ '/': 5, '/line-contacts': 1, '/claims': 2 })
  renderShell()
  expect(screen.getByRole('button', { name: 'เมนู (มีงานรอตัดสิน 3)' })).toBeInTheDocument()
})

test('the menu shows the new logo (not "KP") and the app version', () => {
  renderShell()
  expect(screen.getAllByRole('img', { name: 'ระบบจัดส่งเกาะ' }).length).toBeGreaterThan(0)
  expect(screen.queryByText('KP')).not.toBeInTheDocument()
  expect(screen.getByText('เวอร์ชัน dev')).toBeInTheDocument()
})
