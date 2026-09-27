import { deptGroupOf, deptGroupLabel, DEPT_GROUP_ORDER } from './departments'

test('maps every Makro Dept number to its department group', () => {
  const expected: Record<string, string> = {
    '1': 'FV',
    '2': 'BUT',
    '3': 'FS',
    '4': 'BK',
    '5': 'FZ',
    '6': 'DF2',
    '10': 'DF2',
    '7': 'DF1',
    '8': 'DF1',
    '9': 'DF1',
    '34': 'NF',
    '41': 'NF',
    '45': 'NF',
    '46': 'NF',
  }
  for (const [dept, group] of Object.entries(expected)) expect(deptGroupOf(dept)).toBe(group)
})

test('blank, missing, unlisted or odd values fall into the unknown group', () => {
  for (const v of ['', null, undefined, '99', 'abc', '0']) expect(deptGroupOf(v)).toBe('UNKNOWN')
  expect(deptGroupOf(' 07 ')).toBe('DF1') // tolerant of padding / a leading zero
  expect(deptGroupLabel('UNKNOWN')).toBe('ไม่ทราบแผนก')
  expect(DEPT_GROUP_ORDER.at(-1)).toBe('UNKNOWN')
})
