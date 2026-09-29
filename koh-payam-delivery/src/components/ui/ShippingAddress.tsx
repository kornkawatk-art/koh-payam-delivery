import { MapPinLine } from '@phosphor-icons/react'

/**
 * The Makro shipping address(es) of the order(s) being packed -- it names the
 * shop/resort and sometimes carries the customer's own instructions ("เขียน
 * ข้างกล่องว่า ครูวิทย์ ทุกกล่อง"). Duplicates collapse; nothing renders for
 * orders imported before addresses were kept.
 */
export function ShippingAddress({ addresses }: { addresses: (string | null | undefined)[] }) {
  const list = [...new Set(addresses.map((a) => (a ?? '').trim()).filter(Boolean))]
  if (list.length === 0) return null
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-info-soft px-4 py-3 text-sm ring-1 ring-info/20">
      <MapPinLine size={18} className="mt-0.5 shrink-0 text-info-ink" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xs font-medium text-info-ink">
          ที่อยู่จัดส่งจากแม็คโคร — ดูชื่อร้าน/รีสอร์ต และคำสั่งพิเศษของลูกค้า
        </p>
        {list.map((a) => (
          <p key={a} className="break-words font-medium text-ink">
            {a}
          </p>
        ))}
      </div>
    </div>
  )
}
