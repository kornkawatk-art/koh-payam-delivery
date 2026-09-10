import type { PropsWithChildren } from 'react'

export function Card(p: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={'rounded-lg border bg-white p-4 shadow-sm ' + (p.className ?? '')}>
      {p.children}
    </div>
  )
}
