import { RESPOND_MS, claimStatusTH, respondBy, timeLeft } from './claimSla'

const H = 60 * 60 * 1000
const reported = '2026-10-12T08:00:00Z'
const at = (hours: number) => new Date(reported).getTime() + hours * H

test('a manager has 24 hours from when the customer reported', () => {
  expect(RESPOND_MS).toBe(24 * H)
  expect(respondBy(reported)).toBe(at(24))
})

test('time left reads in hours or minutes, and how late once past', () => {
  expect(timeLeft(reported, at(19))).toEqual({ late: false, label: 'เหลือ 5 ชม.' })
  expect(timeLeft(reported, at(23.5))).toEqual({ late: false, label: 'เหลือ 30 นาที' })
  expect(timeLeft(reported, at(27))).toEqual({ late: true, label: 'เกินมา 3 ชม.' })
  expect(timeLeft(reported, at(24 + 50))).toEqual({ late: true, label: 'เกินมา 2 วัน' })
  expect(timeLeft(reported, at(24.25))).toEqual({ late: true, label: 'เกินมา 15 นาที' })
})

test('statuses read in Thai with a tone', () => {
  expect(claimStatusTH('open', null)).toEqual({ label: 'รอตัดสิน', tone: 'badge-warn' })
  expect(claimStatusTH('closed', 'refund')).toEqual({ label: 'อนุมัติ · คืนเงิน', tone: 'badge-ok' })
  expect(claimStatusTH('approved', 'resend_next_day')).toEqual({ label: 'อนุมัติ · รอส่งชดเชย', tone: 'badge-brand' })
  expect(claimStatusTH('closed', 'resend_next_day')).toEqual({ label: 'ส่งชดเชยแล้ว', tone: 'badge-ok' })
  expect(claimStatusTH('rejected', null)).toEqual({ label: 'ปฏิเสธ', tone: 'badge-neutral' })
})
