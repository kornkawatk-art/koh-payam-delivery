import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { AppLogo } from '../../components/AppLogo'

const MIN_PASSWORD = 8

/**
 * ตั้งรหัสผ่านใหม่: the account was handed a temporary password by a manager (O2O Desk › ผู้ใช้), so the
 * person picks their own before using the app. The same accounts and flag as O2O Desk (migration 0117).
 */
export default function ChangePassword() {
  const { passwordChanged, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ok = password.length >= MIN_PASSWORD && again === password

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || !ok) return
    setBusy(true)
    setErr('')
    const { error } = await supabase.auth.updateUser({ password })
    const { error: e2 } = error ? { error: null } : await supabase.rpc('makro_password_changed')
    if (error || e2) {
      setErr('เปลี่ยนรหัสผ่านไม่สำเร็จ ลองใหม่อีกครั้ง')
      setBusy(false)
      return
    }
    passwordChanged()
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-paper px-4 pt-12 sm:pt-20">
      <div className="mb-6 flex flex-col items-center gap-2">
        <AppLogo size={48} />
        <p className="text-lg font-semibold">ระบบจัดส่งเกาะ</p>
      </div>
      <form onSubmit={onSubmit} className="card flex w-full max-w-sm flex-col gap-4">
        <h1 className="page-title">ตั้งรหัสผ่านใหม่</h1>
        <p className="text-sm text-ink-soft">
          คุณเข้าด้วยรหัสชั่วคราวจากหัวหน้า ตั้งรหัสของคุณเองก่อนใช้งาน (อย่างน้อย {MIN_PASSWORD} ตัว)
        </p>
        <label className="field">
          <span className="field-label">รหัสผ่านใหม่</span>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {password.length > 0 && password.length < MIN_PASSWORD && (
            <span className="text-sm text-danger-ink">ต้องมีอย่างน้อย {MIN_PASSWORD} ตัว</span>
          )}
        </label>
        <label className="field">
          <span className="field-label">พิมพ์รหัสผ่านใหม่อีกครั้ง</span>
          <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          {again.length > 0 && again !== password && <span className="text-sm text-danger-ink">รหัสผ่านสองช่องไม่ตรงกัน</span>}
        </label>
        {err && <p className="alert alert-danger">{err}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy || !ok}>
          {busy ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
          ออกจากระบบ
        </button>
      </form>
    </div>
  )
}
