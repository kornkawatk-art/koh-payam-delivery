import { nameFontMm, parseStickerSelection, stickerList } from './stickers'

test('one sticker per box and piece, numbered 1..N across all kinds in order', () => {
  const s = stickerList({ paper: 2, foam: 1, piece: 2 })
  expect(s.map((x) => [x.no, x.total, x.kind])).toEqual([
    [1, 5, 'ลังกระดาษ'],
    [2, 5, 'ลังกระดาษ'],
    [3, 5, 'ลังโฟม'],
    [4, 5, 'ชิ้น'],
    [5, 5, 'ชิ้น'],
  ])
  expect(stickerList({ paper: 0, foam: 0, piece: 0 })).toEqual([])
})

test('reprint selection: single numbers, lists and ranges within 1..total', () => {
  expect(parseStickerSelection('7', 29)).toEqual([7])
  expect(parseStickerSelection('7, 9', 29)).toEqual([7, 9])
  expect(parseStickerSelection('3-5', 29)).toEqual([3, 4, 5])
  expect(parseStickerSelection(' 2,4-6  4 ', 29)).toEqual([2, 4, 5, 6])
})

test('reprint selection rejects anything that would print the wrong stickers', () => {
  for (const bad of ['', 'abc', '0', '30', '5-3', '3-', '1.5', '2-40']) {
    expect(parseStickerSelection(bad, 29)).toBeNull()
  }
})

test('name size: big for short names, shrinks for long ones, with a floor', () => {
  expect(nameFontMm('JJ')).toBe(13)
  const long = nameFontMm('BLUE VIEW RESORT')
  expect(long).toBeLessThan(6)
  expect(long).toBeGreaterThanOrEqual(4)
  // Thai vowel/tone marks sit above/below the line and take no width
  expect(nameFontMm('ก่ก่ก่ก่ก่ก่ก่ก่ก่ก่')).toBe(nameFontMm('กกกกกกกกกก'))
  expect(nameFontMm('ก่ก่ก่ก่ก่ก่ก่ก่ก่ก่')).toBeLessThan(13)
  expect(nameFontMm('X'.repeat(80))).toBe(4)
})
