import { MAKRO_PICK_TH, makroPickStage } from '../../lib/makroStatus'

const TONE = { waiting: 'badge-neutral', picking: 'badge-warn', ready: 'badge-ok' } as const

/**
 * Makro's picking progress, shown while the island team has not packed the order yet (after that it
 * no longer matters). It is as fresh as the last import of Makro's file.
 */
export function MakroPickBadge({
  status,
  packStatus,
  className = '',
}: {
  status: unknown
  packStatus: string
  className?: string
}) {
  if (packStatus !== 'imported') return null
  const stage = makroPickStage(typeof status === 'string' ? status : null)
  if (!stage) return null
  return <span className={`badge ${TONE[stage]} ${className}`}>{MAKRO_PICK_TH[stage]}</span>
}
