import { supabase } from '../supabase'

export type LineContactRow = {
  phone: string
  displayName: string | null
  createdAt: string
}

// Everyone who has linked their phone number to the shop's LINE account via
// the LIFF registration flow (LineRegister.tsx / register-line-contact).
// Newest registration first -- the DB `order by created_at desc` is trusted
// as-is, not re-sorted client-side.
export async function listLineContacts(): Promise<LineContactRow[]> {
  const { data, error } = await supabase
    .from('line_contacts')
    .select('phone,display_name,created_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error('โหลดรายชื่อผู้ลงทะเบียน LINE ไม่สำเร็จ: ' + error.message)
  return (data ?? []).map((r: any) => ({
    phone: r.phone,
    displayName: r.display_name,
    createdAt: r.created_at,
  }))
}
