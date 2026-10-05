import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getOrCreateShipDay,
  sendOrderLinks,
  setBoats,
  type UnreachedCustomer,
} from '../../lib/api/shipDays'
import { supabase } from '../../lib/supabase'
import { Anchor } from '@phosphor-icons/react'
import { PageHeader } from '../../components/ui/PageHeader'
import { todayLocalISO } from '../../lib/format'
import { EmptyState } from '../../components/ui/EmptyState'
import { Notice, flash, type Flash } from '../../components/ui/Notice'
import { LinkSendReport } from '../../components/LinkSendReport'

type Boat = { id: string; name: string }

export default function BoatSetup() {
  const [date, setDate] = useState(todayLocalISO())
  const [shipDayId, setShipDayId] = useState<string>()
  const [boats, setBoatsState] = useState<Boat[]>([])
  const [failed, setFailed] = useState(false)
  const [msg, setMsg] = useState<Flash>()

  const load = useCallback(() => {
    // A date picker being cleared/edited passes through '' -- don't query
    // (or create a ship day) for a blank date; keep what's on screen.
    if (!date) return
    setFailed(false)
    getOrCreateShipDay(date)
      .then((d) => {
        setShipDayId(d.id)
        setBoatsState(d.boats)
      })
      .catch(() => setFailed(true))
  }, [date])

  useEffect(() => {
    load()
  }, [load])

  async function removeBoat(id: string) {
    const { count, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('ship_date', date)
      .eq('boat_id', id)
    // Fail closed: if the count check errored or returned no number, do not
    // remove — a null count must never be treated as "zero orders bound".
    if (error || count == null) {
      setMsg(flash.error('ตรวจสอบออเดอร์ที่ผูกกับเรือไม่สำเร็จ ลองใหม่อีกครั้ง'))
      return
    }
    if (count > 0) {
      setMsg(flash.error(`ลบไม่ได้: มี ${count} ออเดอร์ผูกกับเรือนี้แล้ว`))
      return
    }
    setBoatsState((b) => b.filter((x) => x.id !== id))
  }

  // Saving also sends the customers' LINE links: a second tap mid-save must
  // not start a second send.
  const [saving, setSaving] = useState(false)
  const [unreached, setUnreached] = useState<UnreachedCustomer[]>([])
  const saveInFlight = useRef(false)

  async function save() {
    if (!shipDayId || saveInFlight.current) return
    saveInFlight.current = true
    setSaving(true)
    setMsg(undefined)
    try {
      await setBoats(shipDayId, boats)
      // setBoats already succeeded at this point — a failure in the
      // secondary sendOrderLinks step below must not make the boat save
      // itself look like it failed (mirrors resolveClaim's "main action
      // succeeded, secondary step failed" message pattern in claims.ts).
      let text = 'บันทึกรายการเรือแล้ว'
      let linksFailed = false
      try {
        const r = await sendOrderLinks(date)
        if (!r.skipped) text += ` · ส่งลิงก์ไลน์ ${r.sent} ฉบับ`
        if (r.unreached.length) text += ` · ยังไม่ได้รับ ${r.unreached.length} ราย`
        setUnreached(r.unreached)
      } catch (e) {
        text += ' แต่ส่งลิงก์ไลน์ไม่สำเร็จ: ' + (e as Error).message
        linksFailed = true
      }
      setMsg(linksFailed ? flash.warn(text) : flash.ok(text))
    } catch {
      setMsg(flash.error('บันทึกรายการเรือไม่สำเร็จ ลองใหม่อีกครั้ง'))
    } finally {
      saveInFlight.current = false
      setSaving(false)
    }
  }

  if (failed)
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="alert alert-danger">โหลดข้อมูลเรือไม่สำเร็จ</p>
        <button className="btn btn-secondary btn-sm" onClick={load}>
          ลองใหม่
        </button>
      </div>
    )

  return (
    <div className="flex flex-col gap-5">
      {unreached.length > 0 && (
        <LinkSendReport unreached={unreached} onClose={() => setUnreached([])} />
      )}
      <PageHeader
        title="ตั้งค่าเรือประจำวัน"
        icon={Anchor}
        accent="amber"
        actions={
          <input
            type="date"
            className="w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        }
      />

      <div className="card flex flex-col gap-3">
        {boats.length === 0 && (
          <EmptyState compact icon={Anchor} title="ยังไม่มีเรือสำหรับวันนี้" />
        )}
        {boats.map((b, i) => (
          <div key={b.id} className="flex items-center gap-2">
            <input
              className="flex-1"
              value={b.name}
              onChange={(e) =>
                setBoatsState((s) =>
                  s.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                )
              }
            />
            <button
              className="btn btn-ghost btn-sm text-danger-ink"
              onClick={() => removeBoat(b.id)}
            >
              ลบ
            </button>
          </div>
        ))}
        <button
          className="btn btn-secondary btn-sm w-fit"
          onClick={() =>
            setBoatsState((s) => [
              ...s,
              { id: String(Date.now()), name: `เรือ ${s.length + 1}` },
            ])
          }
        >
          + เพิ่มเรือ
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        <Notice flash={msg} />
      </div>
    </div>
  )
}
