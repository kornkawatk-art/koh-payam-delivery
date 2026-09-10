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
    <form onSubmit={onSubmit} className="mx-auto mt-24 flex w-80 flex-col gap-3">
      <h1 className="text-xl font-semibold">ยืนยันตัวตนสองชั้น</h1>
      <p className="text-sm text-gray-600">กรอกรหัส 6 หลักจากแอป Authenticator</p>
      <input
        className="rounded border p-2"
        placeholder="รหัส 6 หลัก"
        inputMode="numeric"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        className="rounded bg-black p-2 text-white disabled:opacity-50"
        disabled={busy || !factorId}
      >
        {busy ? 'กำลังยืนยัน…' : 'ยืนยัน'}
      </button>
    </form>
  )
}
