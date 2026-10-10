import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Login from './Login'

vi.mock('../../lib/auth', () => ({ useAuth: () => ({ signIn: vi.fn() }) }))

test('login shows the logo and the app version', () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Login />
    </MemoryRouter>,
  )
  expect(screen.getByRole('img', { name: 'ระบบจัดส่งเกาะ' })).toBeInTheDocument()
  expect(screen.getByText('เวอร์ชัน dev')).toBeInTheDocument()
})
