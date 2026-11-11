import { Package, ShoppingBagOpen, Snowflake } from '@phosphor-icons/react'

/**
 * How many pieces go on the boat, drawn like the sticker the team prints for each box: the total
 * large, then paper boxes / foam boxes / loose pieces with their icons (zeros left out).
 */
export function BoxLabel({ paper, foam, piece, size = 'sm' }: { paper: number; foam: number; piece: number; size?: 'sm' | 'lg' }) {
  const total = paper + foam + piece
  const parts = [
    { n: paper, icon: Package, th: 'ลังกระดาษ' },
    { n: foam, icon: Snowflake, th: 'ลังโฟม' },
    { n: piece, icon: ShoppingBagOpen, th: 'ชิ้น' },
  ].filter((p) => p.n > 0)
  return (
    <span className={'box-label ' + (size === 'lg' ? 'box-label-lg' : '')}>
      <span className="figure">{total}</span>
      {parts.length > 0 && (
        <span className="flex items-center gap-1.5 text-ink-soft">
          {parts.map(({ n, icon: I, th }) => (
            <span key={th} className="inline-flex items-center gap-0.5" title={`${th} ${n}`}>
              <I size={size === 'lg' ? 18 : 13} aria-hidden="true" />
              <span className="tnum">{n}</span>
              <span className="sr-only">{th}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
