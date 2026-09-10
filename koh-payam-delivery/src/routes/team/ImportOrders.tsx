import { useMemo, useState, type ChangeEvent } from 'react'
import { parseMakroFile, type RawRow } from '../../lib/import/parseMakroFile'
import {
  applyMapping,
  validateMapping,
  DEFAULT_MAPPING,
  FIELD_LABELS,
  type ColumnMapping,
  type ParsedOrder,
} from '../../lib/import/mapColumns'
import { commitImport } from '../../lib/api/orders'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { formatTHB, todayLocalISO } from '../../lib/format'

function loadMapping(): ColumnMapping {
  try {
    return { ...DEFAULT_MAPPING, ...JSON.parse(localStorage.getItem('makro_mapping') || '{}') }
  } catch {
    return DEFAULT_MAPPING
  }
}

export default function ImportOrders() {
  const [rows, setRows] = useState<RawRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>(loadMapping)
  const [shipDate, setShipDate] = useState(todayLocalISO())
  const [preview, setPreview] = useState<ParsedOrder[] | null>(null)
  const [pendingForce, setPendingForce] = useState<ParsedOrder[] | null>(null)
  const [overwrites, setOverwrites] = useState<string[]>([])
  const [result, setResult] = useState<string>()
  const [error, setError] = useState<string>()

  const problems = useMemo(
    () => (headers.length ? validateMapping(headers, mapping) : []),
    [headers, mapping],
  )

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(undefined)
    setResult(undefined)
    setPreview(null)
    setPendingForce(null)
    try {
      const parsed = await parseMakroFile(f)
      setRows(parsed)
      setHeaders(parsed.length ? Object.keys(parsed[0]) : [])
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function doPreview() {
    setError(undefined)
    try {
      setPreview(applyMapping(rows, mapping))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function saveMapping(next: ColumnMapping) {
    setMapping(next)
    localStorage.setItem('makro_mapping', JSON.stringify(next))
  }

  async function doImport(force: boolean) {
    if (!preview) return
    setError(undefined)
    try {
      const r = await commitImport(shipDate, preview, { force })
      if (r.overwrites.length && !force) {
        setOverwrites(r.overwrites)
        setPendingForce(preview)
        return
      }
      setResult(
        `นำเข้าสำเร็จ ${r.created} ออเดอร์` +
          (force ? ` (ทับของเดิม ${r.overwrites.length})` : ''),
      )
      setPendingForce(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">นำเข้าออเดอร์</h1>
      <label className="text-sm">
        วันจัดส่ง{' '}
        <input
          type="date"
          className="rounded border p-1"
          value={shipDate}
          onChange={(e) => setShipDate(e.target.value)}
        />
      </label>
      <label className="text-sm">
        เลือกไฟล์จากแม็คโคร (CSV/Excel)
        <input type="file" accept=".csv,.xlsx,.xls" onChange={onFile} className="block" />
      </label>

      {headers.length > 0 && (
        <fieldset className="grid grid-cols-2 gap-2 rounded border p-3">
          <legend className="text-sm font-medium">จับคู่คอลัมน์</legend>
          {(Object.keys(DEFAULT_MAPPING) as (keyof ColumnMapping)[]).map((k) => (
            <label key={k} className="text-sm">
              {FIELD_LABELS[k]}
              <select
                className="block w-full rounded border p-1"
                value={mapping[k]}
                onChange={(e) => saveMapping({ ...mapping, [k]: e.target.value })}
              >
                <option value="">— เลือก —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      )}

      {problems.length > 0 && (
        <ul className="text-sm text-red-600">
          {problems.map((p) => (
            <li key={p}>• {p}</li>
          ))}
        </ul>
      )}
      {headers.length > 0 && problems.length === 0 && (
        <Button onClick={doPreview}>ดูตัวอย่าง</Button>
      )}

      {preview && (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th>เลขออเดอร์</th>
                <th>ลูกค้า</th>
                <th>#รายการ</th>
                <th>มูลค่ารวม</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((o) => (
                <tr key={o.makroOrderNo}>
                  <td>{o.makroOrderNo}</td>
                  <td>{o.customerNameEn}</td>
                  <td>{o.items.length}</td>
                  <td>{formatTHB(o.totalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button onClick={() => doImport(false)}>นำเข้า {preview.length} ออเดอร์</Button>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && <p className="text-sm text-green-700">{result}</p>}

      {pendingForce && (
        <ConfirmDialog
          title="มีออเดอร์ซ้ำกับที่นำเข้าแล้ว"
          body={`ออเดอร์ต่อไปนี้จะถูกเขียนทับ: ${overwrites.join(', ')}\nยืนยันหรือไม่`}
          confirmLabel="ทับของเดิม"
          onConfirm={() => doImport(true)}
          onCancel={() => setPendingForce(null)}
        />
      )}
    </div>
  )
}
