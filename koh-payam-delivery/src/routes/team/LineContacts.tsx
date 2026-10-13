import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listLineContacts,
  listPendingLineContactRequests,
  resolveLineContactRequest,
  type LineContactRow,
  type PendingLineContactRow,
} from '../../lib/api/lineContacts'
import { ArrowRight, ChatCircle } from '@phosphor-icons/react'
import { SkeletonRows } from '../../components/ui/Skeleton'
import { PageHeader } from '../../components/ui/PageHeader'
import { formatDateTH, formatDateTimeTH } from '../../lib/format'
import { StatTile } from '../../components/ui/Stat'
import { EmptyState } from '../../components/ui/EmptyState'

export default function LineContacts() {
  const [rows, setRows] = useState<LineContactRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')

  const [pending, setPending] = useState<PendingLineContactRow[]>([])
  const [pendingFailed, setPendingFailed] = useState(false)
  // Every phone currently mid-decision. A Set (rather than a single scalar)
  // so approving/rejecting one row's request doesn't affect another row's
  // disabled state -- each row only cares whether ITS OWN phone is in here.
  const [busyPhones, setBusyPhones] = useState<Set<string>>(new Set())
  const [pendingError, setPendingError] = useState('')

  const load = useCallback(() => {
    return listLineContacts()
      .then((r) => setRows(r))
      .then(() => setFailed(false))
      .catch(() => setFailed(true))
  }, [])

  const loadPending = useCallback(() => {
    return listPendingLineContactRequests()
      .then((p) => {
        setPending(p)
        setPendingFailed(false)
      })
      .catch(() => setPendingFailed(true))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadPending()
  }, [loadPending])

  async function decide(phone: string, decision: 'approve' | 'reject') {
    setBusyPhones((prev) => new Set(prev).add(phone))
    setPendingError('')
    try {
      await resolveLineContactRequest(phone, decision)
      await Promise.all([load(), loadPending()])
    } catch (e) {
      setPendingError((e as Error).message)
    } finally {
      setBusyPhones((prev) => {
        const next = new Set(prev)
        next.delete(phone)
        return next
      })
    }
  }

  const filtered = useMemo(() => {
    const r = rows ?? []
    const s = q.trim().toLowerCase()
    return s
      ? r.filter(
          (c) =>
            c.phone.toLowerCase().includes(s) ||
            (c.displayName ?? '').toLowerCase().includes(s),
        )
      : r
  }, [rows, q])

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const newThisWeek = (rows ?? []).filter((c) => Date.parse(c.createdAt) >= weekAgo).length

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="ผู้ลงทะเบียน LINE" icon={ChatCircle} />

      <section aria-label="สรุป LINE">
        <dl className="grid grid-cols-3 gap-3">
          <StatTile label="ลงทะเบียนแล้ว" value={rows ? rows.length : '–'} />
          <StatTile label="รออนุมัติ" value={pending.length} danger={pending.length > 0} />
          <StatTile label="ใหม่ 7 วันล่าสุด" value={rows ? newThisWeek : '–'} />
        </dl>
      </section>

      {(pending.length > 0 || pendingFailed) && (
        <section className="flex flex-col gap-2">
          <h2 className="section-title">คำขอรออนุมัติ</h2>
          {pendingFailed && <p className="alert alert-danger">โหลดคำขอรออนุมัติไม่สำเร็จ</p>}
          {pendingError && <p className="alert alert-danger">{pendingError}</p>}
          {!pendingFailed &&
            pending.map((p) => (
              <article
                key={p.phone}
                className="flex flex-col gap-3 rounded-xl border border-danger/30 border-l-4 border-l-danger bg-surface p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-ink-soft">
                  <span>
                    เบอร์ <span className="num text-base font-semibold text-ink">{p.phone}</span>
                  </span>
                  <span>ขอเมื่อ {formatDateTimeTH(p.requestedAt)}</span>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                  <div className="rounded-lg border border-line px-3 py-2">
                    <p className="text-xs text-ink-soft">บัญชีเดิม</p>
                    <p className="truncate font-semibold">{p.oldDisplayName || '—'}</p>
                  </div>
                  <ArrowRight size={16} className="text-ink-faint" aria-hidden="true" />
                  <div className="rounded-lg border border-ok/40 bg-ok-soft px-3 py-2">
                    <p className="text-xs text-ok-ink">บัญชีใหม่</p>
                    <p className="truncate font-semibold">{p.pendingDisplayName || '—'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busyPhones.has(p.phone)}
                    onClick={() => void decide(p.phone, 'approve')}
                  >
                    อนุมัติ
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busyPhones.has(p.phone)}
                    onClick={() => void decide(p.phone, 'reject')}
                  >
                    ปฏิเสธ
                  </button>
                </div>
              </article>
            ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="section-title">ลงทะเบียนแล้ว</h2>
        <input
          placeholder="ค้นหาเบอร์โทร / ชื่อ LINE"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {failed ? (
          <p className="alert alert-danger">โหลดรายชื่อผู้ลงทะเบียน LINE ไม่สำเร็จ</p>
        ) : !rows ? (
          <SkeletonRows />
        ) : filtered.length === 0 ? (
          <EmptyState icon={ChatCircle} title="ยังไม่มีลูกค้าลงทะเบียน" />
        ) : (
          <ul className="table-wrap divide-y divide-line">
            {filtered.map((c) => (
              <li key={c.phone} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ok-soft text-sm font-semibold text-ok-ink"
                  aria-hidden="true"
                >
                  {(c.displayName || '?').trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.displayName || '—'}</span>
                  <span className="num block text-xs text-ink-soft">{c.phone}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-ink-soft" title={formatDateTimeTH(c.createdAt)}>
                  {formatDateTH(c.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
