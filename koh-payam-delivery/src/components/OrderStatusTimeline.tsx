import { Tray, Package, MapPin, CheckCircle, type Icon } from '@phosphor-icons/react'
import { t, type Lang } from '../routes/customer/i18n'

const STEPS = ['imported', 'packed', 'at_pier', 'shipped'] as const

// Same icon-per-status mapping as StatusBadge.tsx (team side) -- a customer
// and a team member looking at the same order recognize the same shape.
const STEP_ICON: Record<(typeof STEPS)[number], Icon> = {
  imported: Tray,
  packed: Package,
  at_pier: MapPin,
  shipped: CheckCircle,
}

/** Four-step delivery progress, highlighted up to the current status. */
export default function OrderStatusTimeline({
  status,
  lang,
}: {
  status: string
  lang: Lang
}) {
  const idx = STEPS.indexOf(status as (typeof STEPS)[number])
  return (
    <ol className="my-4 flex items-start">
      {STEPS.map((s, i) => {
        const done = idx >= 0 && i <= idx
        const current = i === idx
        const Icon = STEP_ICON[s]
        return (
          <li key={s} className="flex flex-1 flex-col items-center text-center last:flex-none">
            <div className="flex w-full items-center">
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={'h-0.5 flex-1 rounded-full transition-colors ' + (done ? 'bg-ok' : 'bg-line-strong')}
                />
              )}
              <span
                aria-current={current ? 'step' : undefined}
                className={
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors ' +
                  (current
                    ? 'border-brand bg-brand text-white shadow-pop'
                    : done
                      ? 'border-ok bg-ok text-white'
                      : 'border-line-strong bg-surface text-ink-faint')
                }
              >
                <Icon size={16} weight={done || current ? 'fill' : 'regular'} aria-hidden="true" />
              </span>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={
                    'h-0.5 flex-1 rounded-full transition-colors ' +
                    (idx > i ? 'bg-ok' : 'bg-line-strong')
                  }
                />
              )}
            </div>
            <span
              className={
                'mt-1.5 max-w-[4.5rem] text-xs font-medium leading-tight ' +
                (current ? 'text-brand-ink' : done ? 'text-ink' : 'text-ink-faint')
              }
            >
              {t(lang, `status_${s}`)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
