import { useEffect, useMemo, useState } from 'react'
import { Tag } from '@phosphor-icons/react'
import { PageHeader } from '../../components/ui/PageHeader'
import { SkeletonRows } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { Notice, flash, type Flash } from '../../components/ui/Notice'
import { formatDateTH } from '../../lib/format'
import {
  listCustomerAliases,
  saveShortName,
  suggestShortName,
  type CustomerAliasRow,
} from '../../lib/api/customerAliases'

/**
 * Manager's list of every customer's sticker short name ("JJ Payam" -> "JJ").
 * Packers can also set/fix a name right at the print button; this page is
 * for reviewing and correcting them in one place.
 */
export default function CustomerAliases() {
  const [rows, setRows] = useState<CustomerAliasRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)

  useEffect(() => {
    listCustomerAliases()
      .then(setRows)
      .catch(() => setFailed(true))
  }, [])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (rows ?? []).filter(
      (r) =>
        (!onlyMissing || !r.shortName) &&
        (!needle ||
          r.name.toLowerCase().includes(needle) ||
          (r.phone ?? '').includes(needle) ||
          (r.shortName ?? '').toLowerCase().includes(needle)),
    )
  }, [rows, q, onlyMissing])

  const missing = (rows ?? []).filter((r) => !r.shortName).length

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="ชื่อย่อลูกค้า" icon={Tag} accent="cyan" />
      <p className="muted">
        ชื่อที่พิมพ์บนสติ๊กเกอร์ติดลัง (ชื่อที่คนเรือเรียก) — ตั้งครั้งเดียว ใช้กับทุกออเดอร์ของลูกค้ารายนั้น
        คนแพ็คตั้ง/แก้ได้ตอนกดพิมพ์สติ๊กเกอร์ด้วย
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="sm:max-w-xs"
          placeholder="ค้นหาชื่อลูกค้า / เบอร์ / ชื่อย่อ"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
          />
          เฉพาะที่ยังไม่ได้ตั้ง ({missing})
        </label>
      </div>

      {failed ? (
        <p className="alert alert-danger">โหลดรายชื่อลูกค้าไม่สำเร็จ</p>
      ) : !rows ? (
        <SkeletonRows rows={6} />
      ) : shown.length === 0 ? (
        <EmptyState icon={Tag} title="ไม่พบลูกค้า" />
      ) : (
        <div className="table-wrap">
          <table className="data-table stack-table">
            <thead>
              <tr>
                <th>ลูกค้า</th>
                <th>เบอร์โทร</th>
                <th>ออเดอร์ล่าสุด</th>
                <th>ชื่อย่อ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <AliasRow
                  key={r.key}
                  row={r}
                  onSaved={(shortName) =>
                    setRows((all) =>
                      (all ?? []).map((x) => (x.key === r.key ? { ...x, shortName } : x)),
                    )
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AliasRow({
  row: r,
  onSaved,
}: {
  row: CustomerAliasRow
  onSaved: (shortName: string) => void
}) {
  const [value, setValue] = useState(r.shortName ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Flash>()
  const dirty = value.trim() !== (r.shortName ?? '') && value.trim() !== ''

  async function save() {
    setBusy(true)
    setMsg(undefined)
    try {
      await saveShortName({ customer_phone: r.phone, customer_name_en: r.name }, value)
      onSaved(value.trim())
      setMsg(flash.ok('บันทึกแล้ว'))
    } catch (e) {
      setMsg(flash.error((e as Error).message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr>
      <td className="stack-lead">{r.name}</td>
      <td data-label="เบอร์โทร" className="tnum whitespace-nowrap">
        {r.phone || '—'}
      </td>
      <td data-label="ออเดอร์ล่าสุด" className="whitespace-nowrap">
        {formatDateTH(r.lastShipDate)}
      </td>
      <td data-label="ชื่อย่อ">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <input
              aria-label={`ชื่อย่อของ ${r.name}`}
              className="w-32"
              value={value}
              placeholder={r.shortName ? undefined : `เช่น ${suggestShortName(r.name)}`}
              onChange={(e) => setValue(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!dirty || busy}
              onClick={() => void save()}
            >
              บันทึก
            </button>
          </div>
          {!r.shortName && !msg && <span className="badge badge-warn w-fit">ยังไม่ได้ตั้ง</span>}
          <Notice flash={msg} />
        </div>
      </td>
    </tr>
  )
}
