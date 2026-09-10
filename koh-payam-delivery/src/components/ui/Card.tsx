import type { PropsWithChildren } from 'react'

export function Card(p: PropsWithChildren<{ className?: string }>) {
  return <div className={'card ' + (p.className ?? '')}>{p.children}</div>
}
