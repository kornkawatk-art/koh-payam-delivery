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

export type Role = 'packer' | 'pier' | 'manager' | 'admin' | 'online' | 'sale' | 'floor'

/** The claim app (same accounts): linked from the menu for the roles that use both apps */
export const CLAIM_APP_URL = 'https://makro-claim.vercel.app'
export const usesBothApps = (role: Role) =>
  role === 'sale' || role === 'manager' || role === 'admin' || role === 'online' || role === 'floor'

/**
 * The manager and the online team (ทีมออนไลน์) run the day together. Only the manager deletes an
 * order or reads the audit log (the database keeps delete for the manager too, migration 0037).
 * แอดมิน (admin) counts as a manager here; it only lacks the user menu, which lives in O2O Desk.
 */
export const isLead = (role: Role | undefined) => role === 'manager' || role === 'admin' || role === 'online'

/** หัวหน้า or แอดมิน: deletes an order, reads the audit log */
export const isBoss = (role: Role | undefined) => role === 'manager' || role === 'admin'

/**
 * sale (the claim app's reporter) only reads here: today's work and an order's page, to tell a
 * customer where their order is. The database allows them reads only (migration 0036).
 */
export const canEdit = (role: Role) => role !== 'sale' && role !== 'floor'
const SALE_PATHS = ['/', '/order']
/**
 * เซลฟลอร์ (floor) reads only, like sale, plus the shortage report (the database refuses them any
 * change, 0127 in O2O Desk). The other team pages are work screens, so they stay closed to them.
 */
const FLOOR_PATHS = ['/', '/order', '/shortage-report']

export const NAV: { path: string; label: string; roles: Role[]; icon: Icon }[] =
  [
    { path: '/', label: 'งานวันนี้', roles: ['packer', 'pier', 'manager', 'admin', 'online', 'sale', 'floor'], icon: House },
    {
      path: '/import',
      label: 'นำเข้าออเดอร์',
      roles: ['packer', 'manager', 'admin', 'online'],
      icon: UploadSimple,
    },
    {
      path: '/boats',
      label: 'ตั้งค่าเรือวันนี้',
      roles: ['pier', 'manager', 'admin', 'online'],
      icon: Anchor,
    },
    { path: '/pier', label: 'ที่ท่าเรือ', roles: ['pier', 'manager', 'admin', 'online'], icon: MapPin },
    { path: '/foam', label: 'ลังโฟม', roles: ['pier', 'manager', 'admin', 'online'], icon: Package },
    { path: '/claims', label: 'คิวเคลม', roles: ['manager', 'admin', 'online'], icon: Flag },
    // pier: chases customers and marks bills paid; releasing a lock stays with the leads (DB: 0037)
    { path: '/debts', label: 'ยอดค้างชำระ', roles: ['pier', 'manager', 'admin', 'online'], icon: Money },
    {
      path: '/line-contacts',
      label: 'ผู้ลงทะเบียน LINE',
      roles: ['manager', 'admin', 'online'],
      icon: ChatCircle,
    },
    {
      path: '/audit-log',
      label: 'ประวัติการใช้งาน',
      roles: ['manager', 'admin'],
      icon: ClockCounterClockwise,
    },
    {
      path: '/shortage-report',
      label: 'รายงานของขาด',
      roles: ['manager', 'admin', 'online', 'floor'],
      icon: ChartBar,
    },
    {
      path: '/customer-aliases',
      label: 'ชื่อย่อลูกค้า',
      roles: ['manager', 'admin', 'online'],
      icon: Tag,
    },
  ]

/** The role in Thai, as the team says it (never the code name) */
export const ROLE_TH: Record<Role, string> = {
  packer: 'คนแพ็ค',
  pier: 'ทีมท่าเรือ',
  manager: 'หัวหน้า',
  admin: 'แอดมิน',
  online: 'ทีมออนไลน์',
  sale: 'เซล',
  floor: 'เซลฟลอร์',
}

/** Short names for the phone's bottom bar */
const TAB_LABEL: Record<string, string> = {
  '/': 'วันนี้',
  '/import': 'นำเข้า',
  '/pier': 'ท่าเรือ',
  '/foam': 'ลังโฟม',
  '/debts': 'ค้างชำระ',
  '/claims': 'เคลม',
  '/shortage-report': 'ของขาด',
}
/** Each role's everyday pages, in the order they use them; everything else stays in the menu */
const TAB_PATHS: Record<Role, string[]> = {
  packer: ['/', '/import'],
  pier: ['/pier', '/foam', '/debts', '/'],
  manager: ['/', '/pier', '/claims', '/shortage-report'],
  admin: ['/', '/pier', '/claims', '/shortage-report'],
  online: ['/', '/pier', '/claims', '/debts'],
  sale: ['/'],
  floor: ['/', '/shortage-report'],
}
export function tabsFor(role: Role) {
  return TAB_PATHS[role]
    .filter((p) => canAccess(p, role))
    .map((p) => ({ path: p, label: TAB_LABEL[p], icon: NAV.find((n) => n.path === p)!.icon }))
}

export function canAccess(path: string, role: Role): boolean {
  // sale: today's work and the order page only -- no pack pages, no other detail pages
  if (role === 'sale') return SALE_PATHS.includes(path)
  if (role === 'floor') return FLOOR_PATHS.includes(path)
  const item = NAV.find((n) => n.path === path)
  if (!item) return true // หน้ารายละเอียด (เช่น /order/:id) เปิดให้ทุกบทบาทที่ล็อกอิน
  return item.roles.includes(role)
}
