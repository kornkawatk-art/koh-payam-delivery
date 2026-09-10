import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { enrollTotp, verifyEnroll } from '../../lib/mfa'

export default function TwoFactorSetup() {
  const nav = useNavigate()
  const [factorId, setFactorId] = useState('')
  const [qr, setQr] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    enrollTotp()
      .then((r) => {
        setFactorId(r.factorId)
        setQr(r.qrSvg)
        setSecret(r.secret)
      })
      .catch((e) => setErr(String(e?.message ?? e)))
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(undefined)
    const { error } = await verifyEnroll(factorId, code)
    setBusy(false)
    if (error) setErr('ยืนยันรหัสไม่สำเร็จ: ' + error)
    else nav('/')
  }

  const isImg = qr.startsWith('data:') || qr.startsWith('http')

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <form onSubmit={onSubmit} className="card flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="page-title">ตั้งค่ายืนยันตัวตนสองชั้น</h1>
          <p className="muted">
            สแกน QR ด้วยแอป Authenticator แล้วกรอกรหัส 6 หลักเพื่อยืนยัน
          </p>
        </div>
        {qr && (
          <div className="mx-auto rounded-xl border border-line bg-surface p-3">
            {isImg ? (
              <img src={qr} alt="QR code" className="h-44 w-44" />
            ) : (
              <div className="h-44 w-44" dangerouslySetInnerHTML={{ __html: qr }} />
            )}
          </div>
        )}
        {secret && (
          <p className="break-all rounded-lg bg-paper px-3 py-2 text-center font-mono text-xs text-ink-soft">
            {secret}
          </p>
        )}
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
