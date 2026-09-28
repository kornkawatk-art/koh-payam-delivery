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

test('customerKey: phone digits when there is a phone, else the upper-cased name', () => {
  expect(customerKey({ customer_phone: '082-628 9533', customer_name_en: 'JJ Payam' })).toBe(
    'phone:0826289533',
  )
  expect(customerKey({ customer_phone: '0826289533' })).toBe('phone:0826289533')
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
  expect(await getShortName({ customer_phone: '0826289533' })).toBe('JJ')
  expect(eq).toHaveBeenCalledWith('customer_key', 'phone:0826289533')

  eq.mockResolvedValue({ data: [], error: null })
  expect(await getShortName({ customer_phone: '0826289533' })).toBeNull()
})

test('saveShortName upserts the trimmed name under the customer key; blank is refused', async () => {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  from.mockReturnValue({ upsert })
  await saveShortName({ customer_phone: '0826289533', customer_name_en: 'JJ Payam' }, '  JJ ')
  expect(upsert.mock.calls[0][0]).toMatchObject({
    customer_key: 'phone:0826289533',
    short_name: 'JJ',
    customer_name: 'JJ Payam',
  })
  await expect(saveShortName({ customer_phone: '1' }, '   ')).rejects.toThrow('ชื่อย่อว่างไม่ได้')
})

test('listCustomerAliases: one row per customer (latest order wins), newest first, with saved names', async () => {
  from.mockImplementation((t: string) => ({
    select: () =>
      Promise.resolve(
        t === 'orders'
          ? {
              data: [
                { customer_name_en: 'JJ Payam', customer_phone: '0826289533', ship_date: '2026-09-01' },
                { customer_name_en: 'JJ PAYAM RESORT', customer_phone: '082-628-9533', ship_date: '2026-09-20' },
                { customer_name_en: 'Sunset', customer_phone: null, ship_date: '2026-09-10' },
              ],
              error: null,
            }
          : { data: [{ customer_key: 'phone:0826289533', short_name: 'JJ' }], error: null },
      ),
  }))
  const rows = await listCustomerAliases()
  expect(rows).toEqual([
    { key: 'phone:0826289533', name: 'JJ PAYAM RESORT', phone: '082-628-9533', shortName: 'JJ', lastShipDate: '2026-09-20' },
    { key: 'name:SUNSET', name: 'Sunset', phone: null, shortName: null, lastShipDate: '2026-09-10' },
  ])
})
