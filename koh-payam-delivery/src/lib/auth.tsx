import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

type Profile = { id: string; name: string; role: 'packer' | 'pier' | 'manager' }
type Aal = 'aal1' | 'aal2' | null
type AuthValue = {
  session: Session | null
  profile: Profile | null
  profileLoaded: boolean
  loading: boolean
  aal: Aal
  mfaLoaded: boolean
  needsMfaSetup: boolean
  needsMfaChallenge: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [aal, setAal] = useState<Aal>(null)
  const [factorCount, setFactorCount] = useState(0)
  const [mfaLoaded, setMfaLoaded] = useState(false)

  async function loadProfile(userId: string) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id,name,role')
        .eq('id', userId)
        .single()
      setProfile((data as Profile) ?? null)
    } catch {
      setProfile(null)
    } finally {
      setProfileLoaded(true)
    }
  }

  async function refreshMfa() {
    try {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      setAal((aalData?.currentLevel as Aal) ?? null)
      const { data: factorData } = await supabase.auth.mfa.listFactors()
      const verified = (factorData?.totp ?? []).filter((f) => f.status === 'verified')
      setFactorCount(verified.length)
    } catch {
      setAal(null)
      setFactorCount(0)
    } finally {
      setMfaLoaded(true)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        Promise.all([loadProfile(data.session.user.id), refreshMfa()]).finally(() =>
          setLoading(false),
        )
      } else {
        setProfileLoaded(true)
        setMfaLoaded(true)
        setLoading(false)
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      setSession(s)
      if (s) {
        if (e === 'SIGNED_IN') {
          setProfileLoaded(false)
          setMfaLoaded(false)
        }
        loadProfile(s.user.id)
        refreshMfa()
      } else {
        setProfile(null)
        setProfileLoaded(true)
        setAal(null)
        setFactorCount(0)
        setMfaLoaded(true)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const needsMfaSetup = mfaLoaded && !!session && factorCount === 0
  const needsMfaChallenge = mfaLoaded && !!session && factorCount > 0 && aal === 'aal1'

  const signIn: AuthValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? { error: error.message } : {}
  }
  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <Ctx.Provider
      value={{
        session,
        profile,
        profileLoaded,
        loading,
        aal,
        mfaLoaded,
        needsMfaSetup,
        needsMfaChallenge,
        signIn,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth ต้องอยู่ใน <AuthProvider>')
  return v
}
