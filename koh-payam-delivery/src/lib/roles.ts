export type Role = 'packer' | 'pier' | 'manager'

export const NAV: { path: string; label: string; roles: Role[] }[] = [
  { path: '/', label: 'งานวันนี้', roles: ['packer', 'pier', 'manager'] },
  { path: '/import', label: 'นำเข้าออเดอร์', roles: ['packer', 'manager'] },
  { path: '/boats', label: 'ตั้งค่าเรือวันนี้', roles: ['pier', 'manager'] },
  { path: '/pier', label: 'ที่ท่าเรือ', roles: ['pier', 'manager'] },
  { path: '/claims', label: 'คิวเคลม', roles: ['manager'] },
  { path: '/line-contacts', label: 'ผู้ลงทะเบียน LINE', roles: ['manager'] },
]

export function canAccess(path: string, role: Role): boolean {
  const item = NAV.find((n) => n.path === path)
  if (!item) return true // หน้ารายละเอียด (เช่น /order/:id) เปิดให้ทุกบทบาทที่ล็อกอิน
  return item.roles.includes(role)
}
