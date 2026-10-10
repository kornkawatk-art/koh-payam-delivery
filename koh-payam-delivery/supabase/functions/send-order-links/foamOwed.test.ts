import { foamOwedByCustomer, linkMessage } from './foamOwed'

const START = '2026-10-10T00:00:00+00:00'
const ship = (phone: string | null, name: string, n: number, at = '2026-10-11T00:00:00+00:00') => ({
  customer_phone: phone,
  customer_name_en: name,
  status: 'shipped',
  shipped_at: at,
  foam_box_count: n,
})

test('balances per customer key: ships since the start, minus returns, set replaces', () => {
  const owed = foamOwedByCustomer(
    [
      ship('082-628-9533', 'JJ Payam', 3),
      ship('0826289533', 'jj payam', 2),
      ship('0826289533', 'JJ Payam', 9, '2026-10-09T00:00:00+00:00'), // before start
      ship(null, 'Sunset', 1),
    ],
    [
      { customer_key: 'phone:0826289533|name:JJ PAYAM', kind: 'return', qty: 1, created_at: '2026-10-12T00:00:00+00:00' },
      { customer_key: 'name:SUNSET', kind: 'set', qty: 4, created_at: '2026-10-12T00:00:00+00:00' },
    ],
    START,
  )
  expect(owed.get('phone:0826289533|name:JJ PAYAM')).toBe(4)
  expect(owed.get('name:SUNSET')).toBe(4)
})

test('a customer with moves but no ships since the start still gets a balance', () => {
  const owed = foamOwedByCustomer(
    [],
    [{ customer_key: 'name:QUIET', kind: 'set', qty: 2, created_at: '2026-10-12T00:00:00+00:00' }],
    START,
  )
  expect(owed.get('name:QUIET')).toBe(2)
})

test('linkMessage adds the foam box line only when the customer holds boxes', () => {
  expect(linkMessage('https://x.app', 'o_tok', 0)).toBe('ออเดอร์ของคุณพร้อมส่งแล้ว ติดตามได้ที่: https://x.app/o/o_tok')
  expect(linkMessage('https://x.app', 'o_tok', 3)).toBe(
    'ออเดอร์ของคุณพร้อมส่งแล้ว ติดตามได้ที่: https://x.app/o/o_tok\nคุณมีลังโฟมของแม็คโครค้างอยู่ 3 ใบ กรุณาคืนกับเรือ',
  )
})
