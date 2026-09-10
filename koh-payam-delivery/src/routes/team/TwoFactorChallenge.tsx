import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { challengeAndVerify, listFactors } from '../../lib/mfa'

export default function TwoFactorChallenge() {
  const nav = useNavigate()
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listFactors()
      .then((r) => {
        if (r.totp[0]) setFactorId(r.totp[0].id)
        else setErr('ไม่พบอุปกรณ์ยืนยันตัวตน')
      })
      .catch((e) => setErr(String(e?.message ?? e)))
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(undefined)
    const { error } = await challengeAndVerify(factorId, code)
    setBusy(false)
    if (error) setErr('ยืนยันรหัสไม่สำเร็จ: ' + error)
    else nav('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <form onSubmit={onSubmit} className="card flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="page-title">ยืนยันตัวตนสองชั้น</h1>
          <p className="muted">กรอกรหัส 6 หลักจากแอป Authenticator</p>
        </div>
        <label className="field">
          <span className="field-label">รหัส 6 หลัก</span>
          <input
            className="text-center text-lg tracking-[0.3em]"
            placeholder="รหัส 6 หลัก"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        {err && <p className="alert alert-danger">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy || !factorId}>
          {busy ? 'กำลังยืนยัน…' : 'ยืนยัน'}
        </button>
      </form>
    </div>
  )
}
