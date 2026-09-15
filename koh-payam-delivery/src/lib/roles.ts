import {
  House,
  UploadSimple,
  Anchor,
  MapPin,
  Flag,
  ChatCircle,
  ClockCounterClockwise,
  type Icon,
} from '@phosphor-icons/react'

export type Role = 'packer' | 'pier' | 'manager'

// One vivid identity color per destination (defined in tailwind.config.js
// under `accent`) -- purely decorative wayfinding, never a status/semantic
// meaning (that stays the ok/warn/danger/info tokens used elsewhere).
export type NavAccent = 'indigo' | 'emerald' | 'amber' | 'teal' | 'rose' | 'line' | 'slate'

export const NAV: { path: string; label: string; roles: Role[]; icon: Icon; accent: NavAccent }[] =
  [
    { path: '/', label: 'งานวันนี้', roles: ['packer', 'pier', 'manager'], icon: House, accent: 'indigo' },
    {
      path: '/import',
      label: 'นำเข้าออเดอร์',
      roles: ['packer', 'manager'],
      icon: UploadSimple,
      accent: 'emerald',
    },
    {
      path: '/boats',
      label: 'ตั้งค่าเรือวันนี้',
      roles: ['pier', 'manager'],
      icon: Anchor,
      accent: 'amber',
    },
    { path: '/pier', label: 'ที่ท่าเรือ', roles: ['pier', 'manager'], icon: MapPin, accent: 'teal' },
    { path: '/claims', label: 'คิวเคลม', roles: ['manager'], icon: Flag, accent: 'rose' },
    {
      path: '/line-contacts',
      label: 'ผู้ลงทะเบียน LINE',
      roles: ['manager'],
      icon: ChatCircle,
      accent: 'line',
    },
    {
      path: '/audit-log',
      label: 'ประวัติการใช้งาน',
      roles: ['manager'],
      icon: ClockCounterClockwise,
      accent: 'slate',
    },
  ]

export function canAccess(path: string, role: Role): boolean {
  const item = NAV.find((n) => n.path === path)
  if (!item) return true // หน้ารายละเอียด (เช่น /order/:id) เปิดให้ทุกบทบาทที่ล็อกอิน
  return item.roles.includes(role)
}
