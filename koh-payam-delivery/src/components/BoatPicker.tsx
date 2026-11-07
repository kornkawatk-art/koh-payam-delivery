import { useState } from 'react'
import { addTimedBoat, type Boat } from '../lib/api/shipDays'

/** The next whole hour, Bangkok time, as HH:MM -- a sensible first guess for the next run. */
export function nextHour(now = new Date()): string {
  const h = (Number(now.toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', hour12: false })) + 1) % 24
  return `${String(h).padStart(2, '0')}:00`
}

const btn = (on: boolean) =>
  'min-h-[3.25rem] rounded-xl border px-5 text-lg font-medium transition-colors ' +
  (on ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface hover:bg-paper')

/**
 * The pier's boat buttons. A timed boat (Speed boat) asks for the departure
 * time first, then adds that day's run ("Speed boat 14:30") and picks it.
 * Runs already added are not separate buttons: the timed boat's button shows
 * the chosen run.
 */
export function BoatPicker({
  shipDayId,
  boats,
  selectedId,
  onChoose,
  onBoatAdded,
  onError,
}: {
  shipDayId: string
  boats: Boat[]
  selectedId: string | null
  onChoose: (boatId: string) => void | Promise<void>
  onBoatAdded: (boat: Boat) => void
  onError: (message: string) => void
}) {
  const [timing, setTiming] = useState<Boat | null>(null)
  const [time, setTime] = useState(nextHour())
  const [busy, setBusy] = useState(false)
  const selected = boats.find((b) => b.id === selectedId)

  async function pickTime() {
    if (!timing || !time || busy) return
    setBusy(true)
    try {
      const run = await addTimedBoat(shipDayId, timing.id, time)
      if (!boats.some((b) => b.id === run.id)) onBoatAdded(run)
      setTiming(null)
      await onChoose(run.id)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {boats
          .filter((b) => !b.of)
          .map((b) => {
            const run = selected?.of === b.id ? selected : null
            return (
              <button
                key={b.id}
                type="button"
                className={btn(selectedId === b.id || !!run || timing?.id === b.id)}
                onClick={() => {
                  if (b.timed) {
                    setTime(nextHour())
                    setTiming(b)
                  } else {
                    setTiming(null)
                    void onChoose(b.id)
                  }
                }}
              >
                {run ? run.name : b.name}
              </button>
            )
          })}
      </div>
      {timing && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-3">
          <label className="field">
            <span className="field-label">เวลาออกของ {timing.name}</span>
            <input type="time" className="w-36" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary" disabled={!time || busy} onClick={() => void pickTime()}>
            {busy ? 'กำลังบันทึก…' : 'เลือกรอบนี้'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setTiming(null)}>
            ยกเลิก
          </button>
        </div>
      )}
    </div>
  )
}
