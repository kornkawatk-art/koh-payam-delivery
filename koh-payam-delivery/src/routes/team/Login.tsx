import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'

export default function Login() {
  const { signIn } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(undefined)
    const { error } = await signIn(email, password)
    setBusy(false)
    if (error) setErr('เข้าสู่ระบบไม่สำเร็จ: ' + error)
    else nav('/')
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand/10 blur-3xl"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-ink to-brand-ink text-base font-semibold text-white shadow-pop">
            KP
          </span>
          <h1 className="page-title">เข้าสู่ระบบทีมงาน</h1>
          <p className="muted">ระบบจัดส่งสินค้าเกาะพยาม</p>
        </div>

        <form onSubmit={onSubmit} className="card flex flex-col gap-4">
          <label className="field">
            <span className="field-label">อีเมล</span>
            <input
              placeholder="อีเมล"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              inputMode="email"
            />
          </label>
          <label className="field">
            <span className="field-label">รหัสผ่าน</span>
            <input
              placeholder="รหัสผ่าน"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {err && <p className="alert alert-danger">{err}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  )
}
