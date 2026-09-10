import { useCallback, useEffect, useState } from 'react'
import { getOrCreateShipDay, setBoats } from '../../lib/api/shipDays'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { todayLocalISO } from '../../lib/format'

type Boat = { id: string; name: string }

export default function BoatSetup() {
  const [date, setDate] = useState(todayLocalISO())
  const [shipDayId, setShipDayId] = useState<string>()
  const [boats, setBoatsState] = useState<Boat[]>([])
  const [failed, setFailed] = useState(false)
  const [msg, setMsg] = useState<string>()

  const load = useCallback(() => {
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
      setMsg('ตรวจสอบออเดอร์ที่ผูกกับเรือไม่สำเร็จ ลองใหม่อีกครั้ง')
      return
    }
    if (count > 0) {
      setMsg(`ลบไม่ได้: มี ${count} ออเดอร์ผูกกับเรือนี้แล้ว`)
      return
    }
    setBoatsState((b) => b.filter((x) => x.id !== id))
  }

  async function save() {
    if (!shipDayId) return
    setMsg(undefined)
    try {
      await setBoats(shipDayId, boats)
      setMsg('บันทึกรายการเรือแล้ว')
    } catch {
      setMsg('บันทึกรายการเรือไม่สำเร็จ ลองใหม่อีกครั้ง')
    }
  }

  if (failed)
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-red-600">โหลดข้อมูลเรือไม่สำเร็จ</p>
        <button className="rounded border px-3 py-1 text-sm" onClick={load}>
          ลองใหม่
        </button>
      </div>
    )

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">ตั้งค่าเรือประจำวัน</h1>
      <input
        type="date"
        className="rounded border p-1"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      {boats.map((b, i) => (
        <div key={b.id} className="flex items-center gap-2">
          <input
            className="rounded border p-1"
            value={b.name}
            onChange={(e) =>
              setBoatsState((s) => s.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
            }
          />
          <button className="text-sm text-red-600" onClick={() => removeBoat(b.id)}>
            ลบ
          </button>
        </div>
      ))}
      <button
        className="w-fit text-sm underline"
        onClick={() =>
          setBoatsState((s) => [...s, { id: String(Date.now()), name: `เรือ ${s.length + 1}` }])
        }
      >
        + เพิ่มเรือ
      </button>
      <Button onClick={save}>บันทึก</Button>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  )
}
