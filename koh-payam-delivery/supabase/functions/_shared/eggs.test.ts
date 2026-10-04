import { eggsPerUnit, maxBrokenEggs } from './eggs'

test('eggsPerUnit reads trays and bundles from the Makro name', () => {
  expect(eggsPerUnit('เอโร่ ไข่ไก่ เบอร์ 1 มีฝา 30 ฟอง')).toBe(30)
  expect(eggsPerUnit('เอโร่ ไข่ไก่ เบอร์ 2 ไม่มีฝา 30 ฟอง x 5')).toBe(150)
  expect(eggsPerUnit('เอโร่ ไข่ไก่คละ เบอร์ 3-4 ไม่มีฝา 30 ฟอง x5')).toBe(150)
  expect(eggsPerUnit('เอโร่ ไข่เค็มต้ม 30 ฟอง')).toBe(30)
})

test('eggsPerUnit: products not sold by the egg are not eggs', () => {
  expect(eggsPerUnit('ตราเกษตร เต้าหู้ไข่ไก่ 105 ก. x 10')).toBeNull()
  expect(eggsPerUnit('เจด ดราก้อน ซาลาเปาลาวาไส้ครีมไข่เค็ม 12 ชิ้น x 4')).toBeNull()
  expect(eggsPerUnit('')).toBeNull()
})

test('maxBrokenEggs scales by what actually shipped', () => {
  expect(maxBrokenEggs('ไข่ไก่ 30 ฟอง x 5', 2)).toBe(300)
  expect(maxBrokenEggs('ไข่ไก่ 30 ฟอง', 1)).toBe(30)
  expect(maxBrokenEggs('ไข่ไก่ 30 ฟอง', 0)).toBe(0)
  expect(maxBrokenEggs('น้ำปลา 700 มล.', 3)).toBe(0)
})
