import { claimTypeTH } from './claimTypes'

test('the team sees each claim type in Thai, including สั่งสินค้าผิดรายการ', () => {
  expect(claimTypeTH('wrong_order')).toBe('สั่งสินค้าผิดรายการ')
  expect(claimTypeTH('damaged')).toBe('สินค้าเสียหาย')
})
