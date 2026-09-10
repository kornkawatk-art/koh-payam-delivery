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
    <form onSubmit={onSubmit} className="mx-auto mt-24 flex w-80 flex-col gap-3">
      <h1 className="text-xl font-semibold">เข้าสู่ระบบทีมงาน</h1>
      <input
        className="rounded border p-2"
        placeholder="อีเมล"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="username"
      />
      <input
        className="rounded border p-2"
        placeholder="รหัสผ่าน"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
      />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="rounded bg-black p-2 text-white disabled:opacity-50" disabled={busy}>
        {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
      </button>
    </form>
  )
}
