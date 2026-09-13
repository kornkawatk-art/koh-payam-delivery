import type { ReactNode } from 'react'
import type { Icon } from '@phosphor-icons/react'
import type { NavAccent } from '../../lib/roles'
import { NAV_ACCENT_CLASSES } from '../../lib/navAccentStyles'

/**
 * Consistent page heading: title on the left, optional controls on the right.
 * `icon`/`accent` are for the 6 top-level NAV destinations only (Dashboard,
 * Import, Boats, Pier, Claims, LINE contacts) -- pass both together to show
 * the same identity color used for that destination in AppShell's sidebar,
 * so a manager recognizes "which section am I in" at a glance. Detail/
 * drill-down pages (order detail, claim detail, pack, label sheet) are not
 * NAV destinations and should omit both -- their title text already carries
 * enough context (order number, customer name).
 */
export function PageHeader({
  title,
  icon: Icon,
  accent,
  actions,
  children,
}: {
  title: ReactNode
  icon?: Icon
  accent?: NavAccent
  actions?: ReactNode
  children?: ReactNode
}) {
  const accentClasses = accent ? NAV_ACCENT_CLASSES[accent] : null
  return (
    <header className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {Icon && accentClasses && (
          <span
            className={
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' +
              accentClasses.chipBg
            }
          >
            <Icon size={20} weight="regular" className={accentClasses.icon} aria-hidden="true" />
          </span>
        )}
        <h1 className="page-title">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      {children}
    </header>
  )
}
