import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './auth'
import { supabase } from './supabase'

vi.mock('./supabase', () => {
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
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    },
  }
})

const auth = supabase.auth as any

beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: { session: null } })
  auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal1' },
  })
  auth.mfa.listFactors.mockResolvedValue({ data: { totp: [] } })
})

function Probe() {
  const { loading, session } = useAuth()
  return <div>{loading ? 'loading' : session ? 'in' : 'out'}</div>
}

function MfaProbe() {
  const { mfaLoaded, needsMfaSetup, needsMfaChallenge } = useAuth()
  if (!mfaLoaded) return <div>mfa-loading</div>
  return (
    <div>
      setup:{String(needsMfaSetup)} challenge:{String(needsMfaChallenge)}
    </div>
  )
}

const fakeSession = { user: { id: 'u1' } } as any

test('resolves to logged-out state when no session', async () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument())
})

test('session + no verified factors => needsMfaSetup', async () => {
  auth.getSession.mockResolvedValue({ data: { session: fakeSession } })
  auth.mfa.listFactors.mockResolvedValue({ data: { totp: [] } })
  render(
    <AuthProvider>
      <MfaProbe />
    </AuthProvider>,
  )
  await waitFor(() =>
    expect(screen.getByText('setup:true challenge:false')).toBeInTheDocument(),
  )
})

test('session + verified factor + aal1 => needsMfaChallenge', async () => {
  auth.getSession.mockResolvedValue({ data: { session: fakeSession } })
  auth.mfa.listFactors.mockResolvedValue({
    data: { totp: [{ id: 'f1', status: 'verified' }] },
  })
  auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal2' },
  })
  render(
    <AuthProvider>
      <MfaProbe />
    </AuthProvider>,
  )
  await waitFor(() =>
    expect(screen.getByText('setup:false challenge:true')).toBeInTheDocument(),
  )
})

test('session + verified factor + aal2 => neither flag', async () => {
  auth.getSession.mockResolvedValue({ data: { session: fakeSession } })
  auth.mfa.listFactors.mockResolvedValue({
    data: { totp: [{ id: 'f1', status: 'verified' }] },
  })
  auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal2', nextLevel: 'aal2' },
  })
  render(
    <AuthProvider>
      <MfaProbe />
    </AuthProvider>,
  )
  await waitFor(() =>
    expect(screen.getByText('setup:false challenge:false')).toBeInTheDocument(),
  )
})
