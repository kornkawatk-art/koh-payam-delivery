import { useCallback, useEffect, useMemo, useState } from 'react'
import { Package } from '@phosphor-icons/react'
import { PageHeader } from '../../components/ui/PageHeader'
import { PageSkeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { Notice, flash, type Flash } from '../../components/ui/Notice'
import { useAuth } from '../../lib/auth'
import { formatDateTH } from '../../lib/format'
import {
  listFoamCustomers,
  recordFoamReturn,
  setFoamBalance,
  type FoamCustomer,
} from '../../lib/api/foamBoxes'

const KIND_TH = { sent: 'ส่งไป', return: 'รับคืน', set: 'ตั้งยอดเป็น' } as const

/**
 * ลังโฟม: who is holding the shop's foam boxes. Pier staff and managers record
 * returns; managers set a balance (opening count or correction).
 */
export default function FoamBoxes() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'
  // undefined = loading, null = tracking not enabled yet (migration 0031 not run)
  const [rows, setRows] = useState<FoamCustomer[] | null | undefined>(undefined)
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [msg, setMsg] = useState<Flash>()

  const load = useCallback(() => {
    listFoamCustomers()
      .then(setRows)
      .catch(() => setRows(null))
  }, [])
  useEffect(load, [load])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (rows ?? []).filter(
      (c) =>
        (showAll || c.balance > 0) &&
        (!s || c.name.toLowerCase().includes(s) || (c.phone ?? '').includes(s)),
    )
  }, [rows, q, showAll])

  if (rows === undefined) return <PageSkeleton rows={6} />
  if (rows === null)
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="ลังโฟม" icon={Package} accent="amber" />
        <p className="alert alert-warn">ยังไม่ได้เปิดใช้ระบบติดตามลังโฟม (รอรัน migration 0031)</p>
      </div>
    )

  const total = rows.reduce((n, c) => n + c.balance, 0)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="ลังโฟม" icon={Package} accent="amber" />
      <p className="text-sm text-ink-soft">
        ลูกค้าถือลังโฟมของร้านอยู่รวม <strong className="text-ink">{total}</strong> ใบ
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="min-w-0 flex-1"
          placeholder="ค้นหาชื่อหรือเบอร์"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          แสดงลูกค้าทั้งหมด
        </label>
      </div>
      <Notice flash={msg} />
      {shown.length === 0 ? (
        <EmptyState
          icon={Package}
          title="ไม่มีลูกค้าที่ค้างลังโฟม"
          hint="ติ๊ก “แสดงลูกค้าทั้งหมด” เพื่อตั้งยอดให้ลูกค้ารายอื่น"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((c) => (
            <FoamRow
              key={c.key}
              c={c}
              isManager={isManager}
              onSaved={(text) => {
                setMsg(flash.ok(text))
                load()
              }}
              onError={(text) => setMsg(flash.error(text))}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function FoamRow({
  c,
  isManager,
  onSaved,
  onError,
}: {
  c: FoamCustomer
  isManager: boolean
  onSaved: (text: string) => void
  onError: (text: string) => void
}) {
  const [mode, setMode] = useState<'none' | 'return' | 'set' | 'history'>('none')
  const [qty, setQty] = useState('1')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const n = Math.floor(Number(qty))
  const valid = Number.isInteger(n) && n >= (mode === 'return' ? 1 : 0) && n <= 9999
  const ref = { key: c.key, name: c.name }
  const qtyLabel = mode === 'return' ? 'จำนวนที่รับคืน' : 'ยอดค้างตอนนี้'

  function open(m: 'return' | 'set' | 'history') {
    setMode(mode === m ? 'none' : m)
    setQty(m === 'set' ? String(c.balance) : '1')
    setNote('')
  }

  async function save() {
    setBusy(true)
    try {
      if (mode === 'return') {
        await recordFoamReturn(ref, n, note)
        onSaved(`บันทึกรับคืน ${n} ใบ จาก ${c.name} แล้ว`)
      } else {
        await setFoamBalance(ref, n, note)
        onSaved(`ตั้งยอดลังโฟมของ ${c.name} เป็น ${n} ใบแล้ว`)
      }
      setMode('none')
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="card flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-col items-start text-left"
          onClick={() => open('history')}
        >
          <span className="font-medium">{c.name}</span>
          <span className="text-xs text-ink-soft">
            {c.phone ?? 'ไม่มีเบอร์'}
            {c.lastSentAt ? ` · ส่งลังล่าสุด ${formatDateTH(c.lastSentAt.slice(0, 10))}` : ''}
          </span>
        </button>
        <span className={`badge ${c.balance > 0 ? 'badge-warn' : 'badge-neutral'} tnum`}>
          ค้าง {c.balance} ใบ
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => open('return')}>
          รับคืน
        </button>
        {isManager && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => open('set')}>
            ตั้งยอด
          </button>
        )}
      </div>

      {(mode === 'return' || mode === 'set') && (
        <div className="flex flex-col gap-2 border-t border-line pt-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="field-label">{qtyLabel}</span>
            <input
              type="number"
              inputMode="numeric"
              min={mode === 'return' ? 1 : 0}
              className="w-24"
              aria-label={qtyLabel}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            ใบ
          </div>
          <input
            placeholder="หมายเหตุ (ไม่บังคับ)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {mode === 'return' && valid && n > c.balance && (
            <p className="text-xs text-warn-ink">
              มากกว่ายอดค้าง ({c.balance} ใบ) — บันทึกได้ แต่ยอดจะเป็น 0 และส่วนเกินไม่นับเป็นเครดิต
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm self-start"
            disabled={!valid || busy}
            onClick={() => void save()}
          >
            {mode === 'return' ? 'บันทึกรับคืน' : 'บันทึกยอด'}
          </button>
        </div>
      )}

      {mode === 'history' && (
        <ul className="flex flex-col gap-1 border-t border-line pt-3 text-xs text-ink-soft">
          {c.events.length === 0 && <li>ยังไม่มีประวัติ</li>}
          {[...c.events].reverse().map((e, i) => (
            <li key={i}>
              {formatDateTH(e.at.slice(0, 10))} · {KIND_TH[e.kind]} {e.qty} ใบ
              {e.label ? ` · ${e.label}` : ''}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
