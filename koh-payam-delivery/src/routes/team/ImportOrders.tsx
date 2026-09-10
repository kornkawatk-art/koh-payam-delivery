import { useMemo, useState, type ChangeEvent } from 'react'
import { parseMakroFile, detectFileKind, type RawRow } from '../../lib/import/parseMakroFile'
import {
  buildImport,
  validateMapping,
  DEFAULT_DETAIL_MAPPING,
  DEFAULT_ORDER_MAPPING,
  FIELD_LABELS_DETAIL,
  FIELD_LABELS_ORDER,
  type DetailMapping,
  type OrderMapping,
  type BuildResult,
} from '../../lib/import/buildImport'
import { commitImport } from '../../lib/api/orders'
import { Button } from '../../components/ui/Button'
import { todayLocalISO } from '../../lib/format'

function loadMapping<T>(key: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }
  } catch {
    return fallback
  }
}
function saveMappingLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable — keep going with in-memory mapping */
  }
}

const DETAIL_LS = 'makro_detail_mapping'
const ORDER_LS = 'makro_order_mapping'

export default function ImportOrders() {
  const [detailRows, setDetailRows] = useState<RawRow[]>([])
  const [detailHeaders, setDetailHeaders] = useState<string[]>([])
  const [orderRows, setOrderRows] = useState<RawRow[]>([])
  const [orderHeaders, setOrderHeaders] = useState<string[]>([])
  const [slotWarn, setSlotWarn] = useState<{ detail?: string; order?: string }>({})

  const [dm, setDm] = useState<DetailMapping>(() => loadMapping(DETAIL_LS, DEFAULT_DETAIL_MAPPING))
  const [om, setOm] = useState<OrderMapping>(() => loadMapping(ORDER_LS, DEFAULT_ORDER_MAPPING))

  const [shipDate, setShipDate] = useState(todayLocalISO())
  const [dateTouched, setDateTouched] = useState(false)
  const [result, setResult] = useState<BuildResult | null>(null)
  const [importMsg, setImportMsg] = useState<string>()
  const [error, setError] = useState<string>()

  const detailProblems = useMemo(
    () => (detailHeaders.length ? validateMapping('detail', detailHeaders, dm) : []),
    [detailHeaders, dm],
  )
  const orderProblems = useMemo(
    () => (orderHeaders.length ? validateMapping('order', orderHeaders, om) : []),
    [orderHeaders, om],
  )

  const canPreview =
    detailRows.length > 0 &&
    orderRows.length > 0 &&
    detailProblems.length === 0 &&
    orderProblems.length === 0

  async function onFile(slot: 'detail' | 'order', e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(undefined)
    setImportMsg(undefined)
    setResult(null)
    try {
      const parsed = await parseMakroFile(f)
      const headers = parsed.length ? Object.keys(parsed[0]) : []
      const kind = detectFileKind(headers)
      if (kind !== slot) {
        setSlotWarn((w) => ({
          ...w,
          [slot]:
            slot === 'detail'
              ? 'ไฟล์นี้ไม่ใช่ไฟล์รายการสินค้า (OrderDetailExport) — โปรดเลือกไฟล์ให้ถูกช่อง'
              : 'ไฟล์นี้ไม่ใช่ไฟล์ที่อยู่ (OrderExport) — โปรดเลือกไฟล์ให้ถูกช่อง',
        }))
        return
      }
      setSlotWarn((w) => ({ ...w, [slot]: undefined }))
      if (slot === 'detail') {
        setDetailRows(parsed)
        setDetailHeaders(headers)
      } else {
        setOrderRows(parsed)
        setOrderHeaders(headers)
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function doPreview() {
    setError(undefined)
    setImportMsg(undefined)
    try {
      const r = buildImport(detailRows, orderRows, dm, om)
      setResult(r)
      if (!dateTouched) setShipDate(r.orders[0]?.expectedDate ?? todayLocalISO())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function doImport() {
    if (!result) return
    setError(undefined)
    try {
      const r = await commitImport(shipDate, result.orders)
      setImportMsg(`นำเข้า ${r.created} ใหม่ · sync ${r.synced}`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">นำเข้าออเดอร์</h1>

      <label className="text-sm">
        ไฟล์รายการสินค้า (OrderDetailExport)
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => onFile('detail', e)}
          className="block"
        />
      </label>
      {slotWarn.detail && <p className="text-sm text-red-600">{slotWarn.detail}</p>}

      <label className="text-sm">
        ไฟล์ที่อยู่ (OrderExport)
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => onFile('order', e)}
          className="block"
        />
      </label>
      {slotWarn.order && <p className="text-sm text-red-600">{slotWarn.order}</p>}

      {detailHeaders.length > 0 && (
        <fieldset className="grid grid-cols-2 gap-2 rounded border p-3">
          <legend className="text-sm font-medium">จับคู่คอลัมน์ — รายการสินค้า</legend>
          {(Object.keys(FIELD_LABELS_DETAIL) as (keyof DetailMapping)[]).map((k) => (
            <label key={k} className="text-sm">
              {FIELD_LABELS_DETAIL[k]}
              <select
                className="block w-full rounded border p-1"
                value={dm[k]}
                onChange={(e) => {
                  const next = { ...dm, [k]: e.target.value }
                  setDm(next)
                  saveMappingLS(DETAIL_LS, next)
                }}
              >
                <option value="">— เลือก —</option>
                {detailHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      )}

      {orderHeaders.length > 0 && (
        <fieldset className="grid grid-cols-2 gap-2 rounded border p-3">
          <legend className="text-sm font-medium">จับคู่คอลัมน์ — ที่อยู่</legend>
          {(Object.keys(FIELD_LABELS_ORDER) as (keyof OrderMapping)[]).map((k) => (
            <label key={k} className="text-sm">
              {FIELD_LABELS_ORDER[k]}
              <select
                className="block w-full rounded border p-1"
                value={om[k]}
                onChange={(e) => {
                  const next = { ...om, [k]: e.target.value }
                  setOm(next)
                  saveMappingLS(ORDER_LS, next)
                }}
              >
                <option value="">— เลือก —</option>
                {orderHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      )}

      {[...detailProblems, ...orderProblems].length > 0 && (
        <ul className="text-sm text-red-600">
          {[...detailProblems, ...orderProblems].map((p) => (
            <li key={p}>• {p}</li>
          ))}
        </ul>
      )}

      <Button onClick={doPreview} disabled={!canPreview}>
        ดูตัวอย่าง
      </Button>

      {result && (
        <>
          <p className="text-sm font-medium text-green-700">
            เจอออเดอร์เกาะพยาม {result.orders.length} เจ้า
          </p>

          {result.shippedAllZero && (
            <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              ⚠️ ไฟล์นี้ยังไม่มีข้อมูลจัดส่งจากแม็คโคร (ส่งจริง = 0 ทั้งหมด) — นำเข้าได้ แต่ควร export
              ใหม่หลังจัดของเสร็จแล้ว sync
            </p>
          )}

          {result.skippedNoItems.length > 0 && (
            <p className="text-sm text-amber-700">
              ข้าม {result.skippedNoItems.length} ออเดอร์ (มีที่อยู่แต่ไม่มีรายการสินค้า):{' '}
              {result.skippedNoItems.join(', ')}
            </p>
          )}

          {result.cancelledLinesDropped > 0 && (
            <p className="text-sm text-amber-700">
              ข้ามรายการที่ยกเลิก {result.cancelledLinesDropped} รายการ
            </p>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th>เลขออเดอร์</th>
                <th>ลูกค้า</th>
                <th>#รายการ</th>
                <th>#ของขาด</th>
              </tr>
            </thead>
            <tbody>
              {result.orders.map((o) => (
                <tr key={o.makroOrderNo}>
                  <td>{o.makroOrderNo}</td>
                  <td>{o.customerName}</td>
                  <td>{o.items.length}</td>
                  <td>{o.items.filter((i) => i.isShort).length}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <label className="text-sm">
            วันจัดส่ง{' '}
            <input
              type="date"
              className="rounded border p-1"
              value={shipDate}
              onChange={(e) => {
                setDateTouched(true)
                setShipDate(e.target.value)
              }}
            />
          </label>

          <Button onClick={doImport} disabled={result.orders.length === 0}>
            นำเข้า {result.orders.length} ออเดอร์
          </Button>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {importMsg && <p className="text-sm text-green-700">{importMsg}</p>}
    </div>
  )
}
