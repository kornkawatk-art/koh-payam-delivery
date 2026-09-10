export const formatTHB = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)
// Team screens stay Thai; customer screens pass the current `lang`.
export const formatDateTH = (iso: string) =>
  new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(iso))
export const formatDateTimeTH = (iso: string) =>
  new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

const DATE_LOCALE: Record<'en' | 'th', string> = { en: 'en-GB', th: 'th-TH' }
export const formatDate = (iso: string, lang: 'en' | 'th') =>
  new Intl.DateTimeFormat(DATE_LOCALE[lang], { dateStyle: 'medium' }).format(new Date(iso))
export const formatDateTime = (iso: string, lang: 'en' | 'th') =>
  new Intl.DateTimeFormat(DATE_LOCALE[lang], { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  )
export const todayLocalISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
