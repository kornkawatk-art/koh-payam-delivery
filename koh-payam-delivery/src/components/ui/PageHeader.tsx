import type { ReactNode } from 'react'

/** Consistent page heading: title on the left, optional controls on the right. */
export function PageHeader({
  title,
  actions,
  children,
}: {
  title: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="page-title">{title}</h1>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      {children}
    </header>
  )
}
