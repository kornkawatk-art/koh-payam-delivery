import { useCallback, useEffect, useRef, useState } from 'react'
import { getBoatDefaults, setBoatDefaults, type Boat } from '../../lib/api/shipDays'
import { Notice, flash, type Flash } from '../../components/ui/Notice'

/** Why a preset list can't be saved, or null when it can. */
export function presetProblem(boats: Boat[]): string | null {
  const names = boats.map((b) => b.name.trim())
  if (names.length === 0) return 'ต้องมีเรืออย่างน้อย 1 ลำ'
  if (names.some((n) => n === '')) return 'ใส่ชื่อเรือให้ครบทุกลำ'
  if (new Set(names).size !== names.length) return 'ชื่อเรือซ้ำกัน'
  return null
}

/**
 * The preset boats (0041): the list every new ship day starts with. Editing it
 * does not touch days that already exist -- those are edited above.
 */
export function BoatDefaults() {
  const [boats, setBoats] = useState<Boat[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [msg, setMsg] = useState<Flash>()
  const [saving, setSaving] = useState(false)
  const saveInFlight = useRef(false)

  const load = useCallback(() => {
    setFailed(false)
    getBoatDefaults()
      .then(setBoats)
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const edit = (i: number, patch: Partial<Boat>) =>
    setBoats((bs) => (bs ?? []).map((b, j) => (j === i ? { ...b, ...patch } : b)))

  async function save() {
    if (!boats || saveInFlight.current) return
    const problem = presetProblem(boats)
    if (problem) {
      setMsg(flash.error(problem))
      return
    }
    saveInFlight.current = true
    setSaving(true)
    setMsg(undefined)
    try {
      const clean = boats.map((b) => ({ id: b.id, name: b.name.trim(), ...(b.timed ? { timed: true } : {}) }))
      await setBoatDefaults(clean)
      setBoats(clean)
      setMsg(flash.ok('บันทึกเรือประจำแล้ว · ใช้กับวันใหม่ที่ยังไม่ได้สร้าง'))
    } catch (e) {
      setMsg(flash.error((e as Error).message))
    } finally {
      saveInFlight.current = false
      setSaving(false)
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-label="เรือประจำ">
      <div>
        <p className="section-title">เรือประจำ</p>
        <p className="text-sm text-ink-soft">
          วันใหม่ทุกวันเริ่มด้วยรายชื่อนี้ วันที่สร้างไว้แล้วแก้ที่รายการด้านบน
        </p>
      </div>
      {failed ? (
        <div className="flex flex-col items-start gap-3">
          <p className="alert alert-danger">โหลดเรือประจำไม่สำเร็จ</p>
          <button className="btn btn-secondary btn-sm" onClick={load}>
            ลองใหม่
          </button>
        </div>
      ) : boats ? (
        <>
          <div className="card flex flex-col gap-3">
            {boats.map((b, i) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2">
                <input
                  className="min-w-0 flex-1"
                  aria-label={`ชื่อเรือประจำลำที่ ${i + 1}`}
                  value={b.name}
                  onChange={(e) => edit(i, { name: e.target.value })}
                />
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={!!b.timed} onChange={(e) => edit(i, { timed: e.target.checked })} />
                  ออกหลายรอบ (เลือกเวลาตอนลงเรือ)
                </label>
                <button
                  className="btn btn-ghost btn-sm text-danger-ink"
                  aria-label={`ลบเรือประจำ ${b.name}`}
                  onClick={() => setBoats((bs) => (bs ?? []).filter((_, j) => j !== i))}
                >
                  ลบ
                </button>
              </div>
            ))}
            <button
              className="btn btn-secondary btn-sm w-fit"
              onClick={() => setBoats((bs) => [...(bs ?? []), { id: String(Date.now()), name: '' }])}
            >
              + เพิ่มเรือประจำ
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'กำลังบันทึก…' : 'บันทึกเรือประจำ'}
            </button>
            <Notice flash={msg} />
          </div>
        </>
      ) : null}
    </section>
  )
}
