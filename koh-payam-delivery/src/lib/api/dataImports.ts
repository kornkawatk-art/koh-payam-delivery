// When this app last imported the Makro files (table makro_data_imports: Makro Claim's
// supabase/migrations/0118_makro_data_imports.sql -- the two apps share the database).
// O2O Desk reads the same rows for its home page and its "not imported in time" reminders.
import { supabase } from '../supabase'

/**
 * Notes an import of both Makro files. The orders are already saved by then, so a
 * failure here only leaves the shown time behind; it never fails the import.
 */
export async function recordImport(orders: number, items: number): Promise<void> {
  try {
    const { error } = await supabase.from('makro_data_imports').insert([
      { app: 'island', file_kind: 'order', row_count: orders },
      { app: 'island', file_kind: 'detail', row_count: items },
    ])
    if (error) console.warn('บันทึกเวลานำเข้าไม่สำเร็จ', error.message)
  } catch (e) {
    console.warn('บันทึกเวลานำเข้าไม่สำเร็จ', e)
  }
}

/** When this app's Makro data dates from: its latest import (both files go in together); null if never */
export async function getLastImport(): Promise<string | null> {
  const { data, error } = await supabase
    .from('makro_data_imports')
    .select('imported_at')
    .eq('app', 'island')
    .order('imported_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  return ((data ?? []) as { imported_at: string }[])[0]?.imported_at ?? null
}
