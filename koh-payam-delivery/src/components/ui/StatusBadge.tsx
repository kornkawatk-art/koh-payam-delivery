import { Tray, Package, MapPin, CheckCircle, Storefront, type Icon } from '@phosphor-icons/react'

const LABEL: Record<string, string> = {
  imported: 'นำเข้าแล้ว',
  packed: 'แพ็คแล้ว',
  at_pier: 'ถึงท่าเรือ',
  shipped: 'ส่งแล้ว',
  picked_up: 'ลูกค้ารับแล้ว',
}

const TONE: Record<string, string> = {
  imported: 'badge-neutral',
  packed: 'badge-ok',
  at_pier: 'badge-brand',
  // Solid fill: same green family as "packed" but visibly the finished state.
  shipped: 'badge-ok-solid',
  // finished too: a store pickup the customer collected
  picked_up: 'badge-ok-solid',
}

// currentColor inherits each badge's own text tone above -- no extra color
// wiring needed to keep the icon in sync with the pill it sits in.
const STATUS_ICON: Record<string, Icon> = {
  imported: Tray,
  packed: Package,
  at_pier: MapPin,
  shipped: CheckCircle,
  picked_up: Storefront,
}

export function StatusBadge({ status }: { status: string }) {
  const Icon = STATUS_ICON[status]
  return (
    <span className={`badge ${TONE[status] ?? 'badge-neutral'}`}>
      {Icon && <Icon size={12} weight="fill" aria-hidden="true" />}
      {LABEL[status] ?? status}
    </span>
  )
}
