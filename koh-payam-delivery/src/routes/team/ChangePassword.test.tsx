import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChangePassword from './ChangePassword'

const updateUser = vi.fn()
const rpc = vi.fn()
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { updateUser: (...a: unknown[]) => updateUser(...a) }, rpc: (...a: unknown[]) => rpc(...a) },
}))
const passwordChanged = vi.fn()
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ passwordChanged, signOut: vi.fn() }) }))

test('a temporary password is replaced (8+ characters, typed twice) before the app opens', async () => {
  updateUser.mockResolvedValue({ error: null })
  rpc.mockResolvedValue({ error: null })
  render(<ChangePassword />)
  const save = screen.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' })
  await userEvent.type(screen.getByLabelText(/^รหัสผ่านใหม่/), 'mynewpass1')
  await userEvent.type(screen.getByLabelText(/^พิมพ์รหัสผ่านใหม่อีกครั้ง/), 'mynewpass')
  expect(save).toBeDisabled()
  await userEvent.type(screen.getByLabelText(/^พิมพ์รหัสผ่านใหม่อีกครั้ง/), '1')
  await userEvent.click(save)
  await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'mynewpass1' }))
  expect(rpc).toHaveBeenCalledWith('makro_password_changed')
  expect(passwordChanged).toHaveBeenCalled()
})
