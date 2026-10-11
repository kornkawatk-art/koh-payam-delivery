import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowLeft,
  Camera,
  Clock,
  ListChecks,
  Package,
  Path,
  Warning,
  type Icon,
} from '@phosphor-icons/react'
import { AppLogo } from '../../components/AppLogo'
import type { Lang } from './i18n'
import { HELP } from './helpContent'

const ICON: Record<string, Icon> = {
  status: Path,
  items: ListChecks,
  photos: Camera,
  claim: Warning,
  foam: Package,
  expiry: Clock,
}

// Same remembered language as the order page.
function readLang(): Lang {
  try {
    return (localStorage.getItem('cust_lang') as Lang) || 'en'
  } catch {
    return 'en'
  }
}

/** Public how-to for the customer order link (/help). */
export default function CustomerHelp() {
  const [lang, setLang] = useState<Lang>(readLang)
  const from = (useLocation().state as { from?: string } | null)?.from
  const c = HELP[lang]

  function switchLang(l: Lang) {
    setLang(l)
    try {
      localStorage.setItem('cust_lang', l)
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }

  return (
    <div className="min-h-screen bg-paper px-4 py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <div className="flex items-center justify-between">
          {from ? (
            <Link className="btn btn-ghost btn-sm -ml-2" to={from}>
              <ArrowLeft size={16} aria-hidden="true" />
              {c.back}
            </Link>
          ) : (
            <AppLogo size={32} className="rounded-lg" />
          )}
          <div className="inline-flex overflow-hidden rounded-lg border border-line text-sm">
            {(['en', 'th'] as const).map((l) => (
              <button
                key={l}
                onClick={() => switchLang(l)}
                className={
                  'px-3 py-1.5 font-medium transition-colors ' +
                  (lang === l ? 'bg-ink text-white' : 'text-ink-soft hover:bg-paper')
                }
              >
                {l === 'en' ? 'EN' : 'ไทย'}
              </button>
            ))}
          </div>
        </div>

        <header className="flex flex-col gap-2">
          <h1 className="page-title">{c.title}</h1>
          <p className="text-ink-soft">{c.intro}</p>
        </header>

        {c.sections.map((s) => {
          const Icon = ICON[s.key] ?? ListChecks
          return (
            <section key={s.key} className="card flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-ink">
                <Icon size={18} weight="fill" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h2 className="font-semibold text-ink">{s.title}</h2>
                <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-ink-soft">
                  {s.body.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </section>
          )
        })}

        <p className="text-center text-sm text-ink-soft">{c.footer}</p>
      </div>
    </div>
  )
}
