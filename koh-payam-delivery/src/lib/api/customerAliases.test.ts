const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../supabase', () => ({ supabase: { from } }))

import {
  customerKey,
  getShortName,
  listCustomerAliases,
  saveShortName,
  suggestShortName,
} from './customerAliases'

beforeEach(() => from.mockReset())

// Paged reads (select -> order -> range): each table serves its rows in the
// slice that range() asks for, like PostgREST.
function mockTables(tables: Record<string, any[]>) {
  from.mockImplementation((t: string) => {
    const b: any = {
      select: () => b,
      order: () => b,
      range: (lo: number, hi: number) =>
        Promise.resolve({ data: (tables[t] ?? []).slice(lo, hi + 1), error: null }),
    }
    return b
  })
}

test('customerKey: phone digits + normalized name, so one owner\u2019s shops each get their own key', () => {
  expect(customerKey({ customer_phone: '082-628 9533', customer_name_en: 'JJ Payam' })).toBe(
    'phone:0826289533|name:JJ PAYAM',
  )
  // same owner (same phone), another shop -> another key
  expect(customerKey({ customer_phone: '0826289533', customer_name_en: 'เต้ย Ziggy' })).toBe(
    'phone:0826289533|name:เต้ย ZIGGY',
  )
  // Makro spacing/casing differences don't split one shop
  expect(customerKey({ customer_phone: '0826289533', customer_name_en: ' jj   payam ' })).toBe(
    'phone:0826289533|name:JJ PAYAM',
  )
  expect(customerKey({ customer_phone: '  ', customer_name_en: ' JJ Payam ' })).toBe('name:JJ PAYAM')
  expect(customerKey({ customer_phone: null, customer_name_en: 'jj payam' })).toBe('name:JJ PAYAM')
})

test('suggestShortName: the first word of the full name', () => {
  expect(suggestShortName('JJ Payam')).toBe('JJ')
  expect(suggestShortName('  Blue View Resort ')).toBe('Blue')
  expect(suggestShortName(null)).toBe('')
})

test('getShortName reads by customer key; null when not set', async () => {
  const eq = vi.fn().mockResolvedValue({ data: [{ short_name: 'JJ' }], error: null })
  from.mockReturnValue({ select: () => ({ eq }) })
  const ref = { customer_phone: '0826289533', customer_name_en: 'JJ Payam' }
  expect(await getShortName(ref)).toBe('JJ')
  expect(eq).toHaveBeenCalledWith('customer_key', 'phone:0826289533|name:JJ PAYAM')

  eq.mockResolvedValue({ data: [], error: null })
  expect(await getShortName(ref)).toBeNull()
})

test('saveShortName upserts the trimmed name under the customer key; blank is refused', async () => {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  from.mockReturnValue({ upsert })
  await saveShortName({ customer_phone: '0826289533', customer_name_en: 'JJ Payam' }, '  JJ ')
  expect(upsert.mock.calls[0][0]).toMatchObject({
    customer_key: 'phone:0826289533|name:JJ PAYAM',
    short_name: 'JJ',
    customer_name: 'JJ Payam',
  })
  await expect(saveShortName({ customer_phone: '1' }, '   ')).rejects.toThrow('ชื่อย่อว่างไม่ได้')
})

test('listCustomerAliases: one row per customer (latest order wins), newest first, with saved names', async () => {
  mockTables({
    orders: [
      { customer_name_en: 'JJ Payam', customer_phone: '0826289533', ship_date: '2026-09-01' },
      { customer_name_en: 'jj  payam', customer_phone: '082-628-9533', ship_date: '2026-09-20' },
      { customer_name_en: 'Ziggy', customer_phone: '0826289533', ship_date: '2026-09-05' },
      { customer_name_en: 'Sunset', customer_phone: null, ship_date: '2026-09-10' },
    ],
    customer_aliases: [{ customer_key: 'phone:0826289533|name:JJ PAYAM', short_name: 'JJ' }],
  })
  const rows = await listCustomerAliases()
  // one row per shop: JJ's two spellings merge; the same owner's Ziggy is its own row
  expect(rows).toEqual([
    { key: 'phone:0826289533|name:JJ PAYAM', name: 'jj  payam', phone: '082-628-9533', shortName: 'JJ', lastShipDate: '2026-09-20' },
    { key: 'name:SUNSET', name: 'Sunset', phone: null, shortName: null, lastShipDate: '2026-09-10' },
    { key: 'phone:0826289533|name:ZIGGY', name: 'Ziggy', phone: '0826289533', shortName: null, lastShipDate: '2026-09-05' },
  ])
})

test('listCustomerAliases reads past the 1000-row cap -- a customer on page 2 is not lost', async () => {
  const many = Array.from({ length: 1000 }, () => ({
    customer_name_en: 'Regular',
    customer_phone: '0811111111',
    ship_date: '2026-09-01',
  }))
  mockTables({
    orders: [...many, { customer_name_en: 'Late Newcomer', customer_phone: '0822222222', ship_date: '2026-10-01' }],
    customer_aliases: [],
  })
  const rows = await listCustomerAliases()
  expect(rows.map((r) => r.name)).toEqual(['Late Newcomer', 'Regular'])
})
