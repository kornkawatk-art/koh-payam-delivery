import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppShell from './AppShell'

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
