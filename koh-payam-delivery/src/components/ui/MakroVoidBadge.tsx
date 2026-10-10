import { MAKRO_VOID_TH, makroVoid } from '../../lib/makroStatus'

/** Red "แม็คโคร: คืนสินค้า / ยกเลิก" when Makro returned or canceled the order. */
export function MakroVoidBadge({ status, className = '' }: { status: unknown; className?: string }) {
  const v = makroVoid(typeof status === 'string' ? status : null)
  if (!v) return null
  return <span className={`badge badge-danger ${className}`}>{MAKRO_VOID_TH[v]}</span>
}
