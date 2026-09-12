import { useEffect, useState } from 'react'
import liff from '@line/liff'

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register-line-contact`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

type InitState = 'loading' | 'ready' | 'error'
type SubmitState = 'idle' | 'busy' | 'success' | 'error'

/**
 * LIFF (LINE Front-end Framework) registration page, opened from a link
 * shared through the shop's LINE Official Account inside LINE's in-app
 * browser. The customer types their phone number; the LIFF SDK supplies a
 * verified LINE id token for whoever is currently logged in to LINE, and the
 * two are POSTed to `register-line-contact`, which re-verifies the token
 * against LINE's own servers before storing the phone <-> LINE-account
 * mapping. One screen, one submission — no multi-step flow.
 *
 * Task 2 (not this page) later uses that mapping to auto-send order links
 * over LINE instead of relying on the customer opening an emailed link.
 */
export default function LineRegister() {
  const [initState, setInitState] = useState<InitState>('loading')
  const [phone, setPhone] = useState('')
  const [submitState, setSubmitState] = useState<SubmitState>('idle')

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        await liff.init({ liffId: import.meta.env.VITE_LIFF_ID as string })
        if (cancelled) return
        if (!liff.isLoggedIn()) {
          liff.login()
          return // login() navigates away and back; nothing more to do here
        }
        setInitState('ready')
      } catch {
        if (!cancelled) setInitState('error')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  async function submit() {
    setSubmitState('busy')
    try {
      const idToken = liff.getIDToken()
      if (!idToken) throw new Error('no id token')
      const res = await fetch(FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ idToken, phone }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error('register failed')
      setSubmitState('success')
    } catch {
      setSubmitState('error')
    }
  }

  return (
    <div className="min-h-screen bg-paper px-4 py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h1 className="text-lg font-semibold text-ink">ลงทะเบียนรับลิงก์ออเดอร์ทาง LINE</h1>

        {initState === 'loading' && (
          <p className="card text-sm text-ink-soft">กำลังเชื่อมต่อ LINE…</p>
        )}

        {initState === 'error' && (
          <p className="alert alert-danger">
            เชื่อมต่อ LINE ไม่สำเร็จ กรุณาเปิดลิงก์นี้จากแอป LINE แล้วลองใหม่
          </p>
        )}

        {initState === 'ready' && submitState !== 'success' && (
          <form
            className="flex flex-col gap-4 rounded-lg border border-line bg-paper p-4"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <label className="field text-sm">
              <span className="field-label">เบอร์โทรศัพท์</span>
              <input
                type="tel"
                inputMode="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0812345678"
              />
            </label>

            {submitState === 'error' && (
              <p className="alert alert-danger">ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p>
            )}

            <button
              type="submit"
              disabled={submitState === 'busy' || !phone.trim()}
              className="btn btn-primary w-full"
            >
              {submitState === 'busy' ? 'กำลังลงทะเบียน…' : 'ลงทะเบียน'}
            </button>
          </form>
        )}

        {submitState === 'success' && (
          <p className="alert alert-ok">
            ลงทะเบียนสำเร็จ ระบบจะส่งลิงก์ออเดอร์ให้ทาง LINE นี้
          </p>
        )}
      </div>
    </div>
  )
}
