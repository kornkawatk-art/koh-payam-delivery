import {
  House,
  UploadSimple,
  Anchor,
  MapPin,
  Flag,
  ChatCircle,
  ClockCounterClockwise,
  ChartBar,
  Tag,
  Package,
  Money,
  type Icon,
} from '@phosphor-icons/react'

export type Role = 'packer' | 'pier' | 'manager' | 'online' | 'sale'

/** The claim app (same accounts): linked from the menu for the roles that use both apps */
export const CLAIM_APP_URL = 'https://makro-claim.vercel.app'
export const usesBothApps = (role: Role) => role === 'sale' || role === 'manager' || role === 'online'

/**
 * The manager and the online team (ทีมออนไลน์) run the day together. Only the manager deletes an
 * order or reads the audit log (the database keeps delete for the manager too, migration 0037).
 */
export const isLead = (role: Role | undefined) => role === 'manager' || role === 'online'

/**
 * sale (the claim app's reporter) only reads here: today's work and an order's page, to tell a
 * customer where their order is. The database allows them reads only (migration 0036).
 */
export const canEdit = (role: Role) => role !== 'sale'
const SALE_PATHS = ['/', '/order']

export const NAV: { path: string; label: string; roles: Role[]; icon: Icon }[] =
  [
    { path: '/', label: 'งานวันนี้', roles: ['packer', 'pier', 'manager', 'online', 'sale'], icon: House },
    {
      path: '/import',
      label: 'นำเข้าออเดอร์',
      roles: ['packer', 'manager', 'online'],
      icon: UploadSimple,
    },
    {
      path: '/boats',
      label: 'ตั้งค่าเรือวันนี้',
      roles: ['pier', 'manager', 'online'],
      icon: Anchor,
    },
    { path: '/pier', label: 'ที่ท่าเรือ', roles: ['pier', 'manager', 'online'], icon: MapPin },
    { path: '/foam', label: 'ลังโฟม', roles: ['pier', 'manager', 'online'], icon: Package },
    { path: '/claims', label: 'คิวเคลม', roles: ['manager', 'online'], icon: Flag },
    { path: '/debts', label: 'ยอดค้างชำระ', roles: ['manager', 'online'], icon: Money },
    {
      path: '/line-contacts',
      label: 'ผู้ลงทะเบียน LINE',
      roles: ['manager', 'online'],
      icon: ChatCircle,
    },
    {
      path: '/audit-log',
      label: 'ประวัติการใช้งาน',
      roles: ['manager'],
      icon: ClockCounterClockwise,
    },
    {
      path: '/shortage-report',
      label: 'รายงานของขาด',
      roles: ['manager', 'online'],
      icon: ChartBar,
    },
    {
      path: '/customer-aliases',
      label: 'ชื่อย่อลูกค้า',
      roles: ['manager', 'online'],
      icon: Tag,
    },
  ]

export function canAccess(path: string, role: Role): boolean {
  // sale: today's work and the order page only -- no pack pages, no other detail pages
  if (role === 'sale') return SALE_PATHS.includes(path)
  const item = NAV.find((n) => n.path === path)
  if (!item) return true // หน้ารายละเอียด (เช่น /order/:id) เปิดให้ทุกบทบาทที่ล็อกอิน
  return item.roles.includes(role)
}
