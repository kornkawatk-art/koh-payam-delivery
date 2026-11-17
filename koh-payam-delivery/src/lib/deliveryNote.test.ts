import { defaultNoteLang, hasShipped, noteCodes, noteDateTime, shortQty } from './deliveryNote'
import { splitBarcodes } from './import/buildImport'

test('splitBarcodes reads the Bar_Code cell: every code, digits only, no repeats', () => {
  expect(splitBarcodes('21005169 || 2500001005168 || 8855199532670 || 8855199632677')).toEqual([
    '21005169',
    '2500001005168',
    '8855199532670',
    '8855199632677',
  ])
  expect(splitBarcodes(' 8850987101656 ||  8850987101656 || ')).toEqual(['8850987101656'])
  expect(splitBarcodes('')).toEqual([])
  expect(splitBarcodes(undefined)).toEqual([])
})

describe('noteCodes: what the receipt would show', () => {
  test("the maker's codes, all of them (13 and 14 digits), never Makro's own", () => {
    expect(noteCodes(['21005169', '2500001005168', '8855199532670', '8855199632677'])).toEqual([
      '8855199532670',
      '8855199632677',
    ])
    expect(noteCodes(['18851717040020', '2500000000001'])).toEqual(['18851717040020'])
  })
  test("fresh goods without a maker code: Makro's 250... code, not the weight-carrying ones", () => {
    expect(
      noteCodes(['20328252', '210044110000000000000', '2144110000000', '2500000328251', '2844110000000']),
    ).toEqual(['2500000328251'])
    expect(noteCodes(['2144110000000'])).toEqual(['2144110000000'])
  })
  test('nothing usable -> none (the 6-digit code shows instead)', () => {
    expect(noteCodes(['21005169'])).toEqual([])
    expect(noteCodes([])).toEqual([])
  })
})

test('short quantity never goes negative and keeps weighed fractions tidy', () => {
  expect(shortQty({ ordered: 5, shipped: 3 })).toBe(2)
  expect(shortQty({ ordered: 1.5, shipped: 1.05 })).toBe(0.45)
  expect(shortQty({ ordered: 2, shipped: 3 })).toBe(0)
})

test('hasShipped: false while Makro still shows 0 delivered on every line', () => {
  expect(hasShipped({ items: [{ shipped: 0 }, { shipped: 0 }] as never })).toBe(false)
  expect(hasShipped({ items: [{ shipped: 0 }, { shipped: 2 }] as never })).toBe(true)
})

test('Myanmar POs open the Myanmar note; the rest Thai', () => {
  expect(defaultNoteLang('myanmar')).toBe('my')
  expect(defaultNoteLang('payam')).toBe('th')
  expect(defaultNoteLang(null)).toBe('th')
})

test('the "as of" time is Thai time', () => {
  expect(noteDateTime('2026-11-17T02:25:00Z')).toBe('17/11/2026 09:25')
})
