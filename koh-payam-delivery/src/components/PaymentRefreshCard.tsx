import { useState, type ChangeEvent } from 'react'
import { parseMakroFile } from '../lib/import/parseMakroFile'
import { buildPaymentRefresh, type OrderMapping, type PaymentRow } from '../lib/import/buildImport'
import { refreshPayments } from '../lib/api/paymentRefresh'

/**
 * "อัปเดตสถานะการจ่ายเงินอย่างเดียว": feed a multi-day OrderExport back-catalogue
 * safely -- only POs already in the app are touched; nothing is created.
 */
export function PaymentRefreshCard({ orderMapping }: { orderMapping: OrderMapping }) {
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>()
  const [err, setErr] = useState<string>()

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    setMsg(undefined)
    setErr(undefined)
    const f = e.target.files?.[0]
    if (!f) return
    try {
      setRows(buildPaymentRefresh(await parseMakroFile(f), orderMapping))
    } catch {
      setErr('อ่านไฟล์ไม่สำเร็จ')
    }
  }

  async function run() {
    setBusy(true)
    setErr(undefined)
    try {
      const r = await refreshPayments(rows)
      setMsg(
        `อัปเดตสถานะการจ่ายเงิน ${r.refreshed} ออเดอร์ · ไม่พบในแอป ${r.notInApp.length} ออเดอร์ (ข้าม)`,
      )
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card flex flex-col gap-3">
      <p className="section-title">อัปเดตสถานะการจ่ายเงินอย่างเดียว</p>
      <p className="text-sm text-ink-soft">
        ใช้ไฟล์ OrderExport ย้อนหลังหลายวันได้ — อัปเดตเฉพาะออเดอร์ที่มีในแอปแล้ว ไม่สร้างออเดอร์ใหม่
      </p>
      <label className="field">
        <span className="field-label">ไฟล์ OrderExport (ย้อนหลังหลายวันได้)</span>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          aria-label="ไฟล์ OrderExport (ย้อนหลังหลายวันได้)"
          onChange={(e) => void onFile(e)}
        />
      </label>
      <button
        type="button"
        className="btn btn-secondary self-start"
        disabled={busy || rows.length === 0}
        onClick={() => void run()}
      >
        {busy ? 'กำลังอัปเดต…' : 'อัปเดตสถานะการจ่ายเงิน'}
      </button>
      {msg && <p className="alert alert-ok">{msg}</p>}
      {err && <p className="alert alert-danger">{err}</p>}
    </section>
  )
}
