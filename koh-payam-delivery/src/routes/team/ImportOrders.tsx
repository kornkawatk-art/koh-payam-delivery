import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
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
import { commitImport, listOrdersOnOtherDays, type OtherDayOrder } from '../../lib/api/orders'
import { UploadSimple } from '@phosphor-icons/react'
import { PageHeader } from '../../components/ui/PageHeader'
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
  // POs in this file that already exist on another ship day (they'll be skipped)
  const [alreadyImported, setAlreadyImported] = useState<OtherDayOrder[]>([])

  useEffect(() => {
    if (!result || result.orders.length === 0) {
      setAlreadyImported([])
      return
    }
    let active = true
    listOrdersOnOtherDays(result.orders.map((o) => o.makroOrderNo), shipDate)
      .then((rows) => active && setAlreadyImported(rows))
      .catch(() => active && setAlreadyImported([])) // preview hint only; commit re-checks
    return () => {
      active = false
    }
  }, [result, shipDate])
  const skipNos = useMemo(
    () => new Set(alreadyImported.map((r) => r.makro_order_no)),
    [alreadyImported],
  )
  const toImport = result ? result.orders.filter((o) => !skipNos.has(o.makroOrderNo)) : []

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
      setImportMsg(
        `นำเข้า ${r.created} ใหม่ · sync ${r.synced}` +
          (r.skipped.length > 0 ? ` · ข้าม ${r.skipped.length} ที่เคยนำเข้าแล้ว` : ''),
      )
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const allProblems = [...detailProblems, ...orderProblems]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="นำเข้าออเดอร์" icon={UploadSimple} accent="emerald" />

      <div className="card grid gap-4 sm:grid-cols-2">
        <label className="field">
          <span className="field-label">ไฟล์รายการสินค้า (OrderDetailExport)</span>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => onFile('detail', e)} />
          {slotWarn.detail && <span className="text-sm text-danger-ink">{slotWarn.detail}</span>}
        </label>

        <label className="field">
          <span className="field-label">ไฟล์ที่อยู่ (OrderExport)</span>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => onFile('order', e)} />
          {slotWarn.order && <span className="text-sm text-danger-ink">{slotWarn.order}</span>}
        </label>
      </div>

      {detailHeaders.length > 0 && (
        <fieldset className="card grid gap-3 sm:grid-cols-2">
          <legend className="section-title px-1">จับคู่คอลัมน์ — รายการสินค้า</legend>
          {(Object.keys(FIELD_LABELS_DETAIL) as (keyof DetailMapping)[]).map((k) => (
            <label key={k} className="field">
              <span className="field-label">{FIELD_LABELS_DETAIL[k]}</span>
              <select
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
        <fieldset className="card grid gap-3 sm:grid-cols-2">
          <legend className="section-title px-1">จับคู่คอลัมน์ — ที่อยู่</legend>
          {(Object.keys(FIELD_LABELS_ORDER) as (keyof OrderMapping)[]).map((k) => (
            <label key={k} className="field">
              <span className="field-label">{FIELD_LABELS_ORDER[k]}</span>
              <select
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

      {allProblems.length > 0 && (
        <ul className="alert alert-danger flex flex-col gap-0.5">
          {allProblems.map((p) => (
            <li key={p}>• {p}</li>
          ))}
        </ul>
      )}

      <button className="btn btn-primary w-full sm:w-auto" onClick={doPreview} disabled={!canPreview}>
        ดูตัวอย่าง
      </button>

      {result && (
        <div className="flex flex-col gap-4 border-t border-line pt-5">
          <p className="text-sm font-semibold text-ok-ink">
            เจอออเดอร์เกาะพยาม {result.orders.length} เจ้า
          </p>

          {result.shippedAllZero && (
            <p className="alert alert-warn">
              ⚠️ ไฟล์นี้ยังไม่มีข้อมูลจัดส่งจากแม็คโคร (ส่งจริง = 0 ทั้งหมด) — นำเข้าได้ แต่ควร
              export ใหม่หลังจัดของเสร็จแล้ว sync
            </p>
          )}

          {result.skippedNoItems.length > 0 && (
            <p className="muted">
              ข้าม {result.skippedNoItems.length} ออเดอร์ (มีที่อยู่แต่ไม่มีรายการสินค้า):{' '}
              {result.skippedNoItems.join(', ')}
            </p>
          )}

          {result.cancelledLinesDropped > 0 && (
            <p className="muted">ข้ามรายการที่ยกเลิก {result.cancelledLinesDropped} รายการ</p>
          )}

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>เลขออเดอร์</th>
                  <th>ลูกค้า</th>
                  <th>#รายการ</th>
                  <th>#ของขาด</th>
                </tr>
              </thead>
              <tbody>
                {result.orders.map((o) => (
                  <tr key={o.makroOrderNo}>
                    <td className="whitespace-nowrap">{o.makroOrderNo}</td>
                    <td>{o.customerName}</td>
                    <td className="tnum">{o.items.length}</td>
                    <td className="tnum">{o.items.filter((i) => i.isShort).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {alreadyImported.length > 0 && (
            <div className="alert alert-warn">
              <p className="font-semibold">
                จะข้าม {new Set(alreadyImported.map((r) => r.makro_order_no)).size} ออเดอร์ที่เคยนำเข้าแล้วในวันอื่น
              </p>
              <p className="mt-1 text-xs">
                {alreadyImported
                  .map((r) => `${r.makro_order_no} (${r.ship_date})`)
                  .join(', ')}
              </p>
            </div>
          )}

          <label className="field w-fit">
            <span className="field-label">วันจัดส่ง</span>
            <input
              type="date"
              className="w-auto"
              value={shipDate}
              onChange={(e) => {
                setDateTouched(true)
                setShipDate(e.target.value)
              }}
            />
          </label>

          <button
            className="btn btn-primary w-full sm:w-auto"
            onClick={doImport}
            disabled={toImport.length === 0}
          >
            นำเข้า {toImport.length} ออเดอร์
          </button>
        </div>
      )}

      {error && <p className="alert alert-danger">{error}</p>}
      {importMsg && <p className="alert alert-ok">{importMsg}</p>}
    </div>
  )
}
