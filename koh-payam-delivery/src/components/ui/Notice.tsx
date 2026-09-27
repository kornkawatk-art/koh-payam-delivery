import { CheckCircle, Warning, WarningCircle } from '@phosphor-icons/react'

/**
 * The outcome of an action ("บันทึกแล้ว", an error) with its tone, so the
 * page can show success and failure differently instead of the same small
 * grey line for both. `warn` is for "the main action worked, a follow-up
 * step didn't" (e.g. boats saved but LINE links failed to send).
 */
export type Flash = { text: string; tone: 'ok' | 'warn' | 'error' }

export const flash = {
  ok: (text: string): Flash => ({ text, tone: 'ok' }),
  warn: (text: string): Flash => ({ text, tone: 'warn' }),
  error: (text: string): Flash => ({ text, tone: 'error' }),
}

const STYLE = {
  ok: { cls: 'alert-ok', Icon: CheckCircle },
  warn: { cls: 'alert-warn', Icon: Warning },
  error: { cls: 'alert-danger', Icon: WarningCircle },
} as const

export function Notice({ flash: f }: { flash?: Flash }) {
  if (!f) return null
  const { cls, Icon } = STYLE[f.tone]
  return (
    <div
      className={`alert ${cls} flex items-start gap-2`}
      role={f.tone === 'error' ? 'alert' : 'status'}
    >
      <Icon size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>{f.text}</p>
    </div>
  )
}
