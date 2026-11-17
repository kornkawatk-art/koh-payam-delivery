import { parsePriceSheet, withValues, formatBaht } from './itemPrices'
import type { ShortageReport } from './api/shortageReport'

describe('parsePriceSheet', () => {
  test('finds the header below a title row and reads codes and prices', () => {
    const r = parsePriceSheet([
      ['ราคาสินค้า พ.ย.'],
      ['Item Id', 'Product Name', 'Price'],
      [100516, 'ชเวปส์', '1,250.50'],
      ['892013', 'มินิทเมด', '฿99'],
    ])
    expect(r.rows).toEqual([
      { itemId: '100516', price: 1250.5, productName: 'ชเวปส์' },
      { itemId: '892013', price: 99, productName: 'มินิทเมด' },
    ])
    expect(r.skipped).toBe(0)
  })

  test("reads the report's own export (รหัสสินค้า / สินค้า / ราคาต่อหน่วย), skipping blank prices", () => {
    const r = parsePriceSheet([
      ['แผนก', 'รหัสสินค้า', 'สินค้า', 'จำนวนครั้งที่ขาด', 'จำนวนที่ขาดรวม', 'ราคาต่อหน่วย', 'มูลค่าที่ขาดคร่าวๆ'],
      ['FV', '100001', 'มะพร้าว', 2, 8, 25, 200],
      ['FV', '100002', 'กล้วย', 1, 1, '', ''],
      [],
    ])
    expect(r.rows).toEqual([{ itemId: '100001', price: 25, productName: 'มะพร้าว' }])
    expect(r.skipped).toBe(1)
  })

  test('a code listed twice keeps the last price', () => {
    expect(parsePriceSheet([['รหัส', 'ราคา'], ['1', 5], ['1', 7]]).rows).toEqual([{ itemId: '1', price: 7, productName: null }])
  })

  test('no code or price column is an error', () => {
    expect(() => parsePriceSheet([['ชื่อ', 'จำนวน'], ['a', 1]])).toThrow('รหัสสินค้า')
  })
})

test('withValues: quantity short x price per product, department and report; unpriced stay null', () => {
  const report = {
    productCount: 2,
    occurrenceCount: 3,
    affectedOrderCount: 2,
    groups: [
      {
        code: 'FV',
        label: 'FV',
        occurrenceCount: 3,
        products: [
          { key: '1', itemId: '1', productName: 'a', dept: 'FV', totalQty: 2.5, orderCount: 2, details: [] },
          { key: 'name:b', itemId: '', productName: 'b', dept: 'FV', totalQty: 4, orderCount: 1, details: [] },
        ],
      },
    ],
  } as unknown as ShortageReport
  const v = withValues(report, new Map([['1', 40]]))
  expect(v.value).toBe(100)
  expect(v.pricedProducts).toBe(1)
  expect(v.groups[0].value).toBe(100)
  expect(v.groups[0].products.map((p) => p.value)).toEqual([100, null])
})

test('formatBaht rounds to whole baht', () => {
  expect(formatBaht(12345.6)).toBe('฿12,346')
})
