import { t, type Lang } from '../routes/customer/i18n'

const STEPS = ['imported', 'packed', 'at_pier', 'shipped'] as const

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
    <ol className="my-4 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs">
      {STEPS.map((s, i) => {
        const done = idx >= 0 && i <= idx
        const current = i === idx
        return (
          <li key={s} className="flex items-center gap-1.5">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={'h-px w-4 ' + (done ? 'bg-ink' : 'bg-line-strong')}
              />
            )}
            <span
              aria-current={current ? 'step' : undefined}
              className={
                'rounded-full border px-2.5 py-1 font-medium transition-colors ' +
                (current
                  ? 'border-ink bg-ink text-white'
                  : done
                    ? 'border-ink/20 bg-paper text-ink'
                    : 'border-line text-ink-faint')
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
