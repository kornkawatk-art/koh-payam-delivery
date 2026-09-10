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
    <form onSubmit={onSubmit} className="mx-auto mt-24 flex w-80 flex-col gap-3">
      <h1 className="text-xl font-semibold">ตั้งค่ายืนยันตัวตนสองชั้น</h1>
      <p className="text-sm text-gray-600">
        สแกน QR ด้วยแอป Authenticator แล้วกรอกรหัส 6 หลักเพื่อยืนยัน
      </p>
      {qr &&
        (isImg ? (
          <img src={qr} alt="QR code" className="mx-auto h-48 w-48" />
        ) : (
          <div className="mx-auto h-48 w-48" dangerouslySetInnerHTML={{ __html: qr }} />
        ))}
      {secret && <p className="break-all text-center text-xs text-gray-500">{secret}</p>}
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
