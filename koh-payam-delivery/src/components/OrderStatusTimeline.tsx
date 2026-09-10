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
    <ol className="my-3 flex flex-wrap gap-1.5 text-xs">
      {STEPS.map((s, i) => {
        const done = idx >= 0 && i <= idx
        return (
          <li
            key={s}
            aria-current={i === idx ? 'step' : undefined}
            className={
              'rounded-full border px-2 py-0.5 ' +
              (done ? 'border-black bg-black text-white' : 'text-gray-400')
            }
          >
            {t(lang, `status_${s}`)}
          </li>
        )
      })}
    </ol>
  )
}
