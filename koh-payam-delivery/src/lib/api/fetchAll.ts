/**
 * Supabase's API returns at most 1000 rows per request and silently drops the
 * rest -- no error. Any read that can outgrow that (whole-table lists, long
 * date ranges) goes through here: `page(from, to)` must build the query with
 * a stable `.order(...)` and end in `.range(from, to)`.
 */
export const PAGE_SIZE = 1000

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE_SIZE) return out
  }
}

/** ISO date `days` before today (local) -- the window for name suggestions. */
export function daysAgoISO(days: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
