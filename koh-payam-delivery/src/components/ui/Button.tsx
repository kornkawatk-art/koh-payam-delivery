import type { ButtonHTMLAttributes } from 'react'

export function Button(p: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={
        'rounded bg-black px-3 py-2 text-white disabled:opacity-50 ' + (p.className ?? '')
      }
    />
  )
}
