import { render, screen } from '@testing-library/react'
import App from './App'
import { supabase } from './lib/supabase'

vi.mock('./lib/supabase', () => {
  const single = vi.fn().mockResolvedValue({ data: null, error: null })
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        mfa: {
          getAuthenticatorAssuranceLevel: vi
            .fn()
            .mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } }),
          listFactors: vi.fn().mockResolvedValue({ data: { totp: [] } }),
        },
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single,
      }),
      channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
      removeChannel: vi.fn(),
    },
  }
})

const auth = supabase.auth as any
const single = (supabase.from as any)('profiles').single as any

beforeEach(() => {
  window.history.pushState({}, '', '/')
  auth.getSession.mockResolvedValue({ data: { session: null } })
  auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal1' },
  })
  auth.mfa.listFactors.mockResolvedValue({ data: { totp: [] } })
  single.mockResolvedValue({ data: null, error: null })
})

test('renders team login screen', async () => {
  render(<App />)
  expect(await screen.findByText(/เข้าสู่ระบบทีมงาน/)).toBeInTheDocument()
})

test('authed MFA-satisfied user with no profile row is redirected off a role-gated route (no hang)', async () => {
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
  auth.mfa.listFactors.mockResolvedValue({
    data: { totp: [{ id: 'f1', status: 'verified' }] },
  })
  auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal2', nextLevel: 'aal2' },
  })
  single.mockResolvedValue({ data: null, error: null })
  window.history.pushState({}, '', '/claims')

  render(<App />)

  // Fails closed to "/" (DailyDashboard), never renders the restricted page, never hangs on the loader.
  expect(await screen.findByPlaceholderText(/ค้นหาชื่อลูกค้า/)).toBeInTheDocument()
  expect(screen.queryByText('ClaimsQueue')).not.toBeInTheDocument()
  expect(screen.queryByText('กำลังโหลด…')).not.toBeInTheDocument()
})
