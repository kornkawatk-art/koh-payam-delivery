import type { ReactNode } from 'react'
import type { Icon } from '@phosphor-icons/react'
import { BackLink } from './BackLink'

/**
 * Consistent page heading: title on the left, optional controls on the right.
 * `icon` is for the top-level NAV destinations only (see `src/lib/roles.ts`)
 * and shows the same monochrome icon as the sidebar; detail pages omit it.
 *
 * `back` puts a "‹ parent page" link above the title -- use it on those
 * drill-down pages so phone users have an on-screen way back.
 */
export function PageHeader({
  title,
  icon: Icon,
  actions,
  back,
  children,
}: {
  title: ReactNode
  icon?: Icon
  actions?: ReactNode
  back?: { to: string; label: string }
  children?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col">
        {back && <BackLink to={back.to} label={back.label} />}
        <div className="flex items-center gap-3">
          {Icon && <Icon size={22} weight="regular" className="shrink-0 text-ink-soft" aria-hidden="true" />}
          <h1 className="page-title">{title}</h1>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      {children}
    </header>
  )
}
