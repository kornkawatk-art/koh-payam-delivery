import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import AppShell from './AppShell'

const useAppUpdate = vi.fn().mockReturnValue(false)
vi.mock('../lib/useAppUpdate', () => ({ useAppUpdate: () => useAppUpdate() }))

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ profile: { name: 'ก', role: 'packer' }, signOut: vi.fn() }),
}))

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
