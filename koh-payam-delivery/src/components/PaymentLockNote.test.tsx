import { render, screen } from '@testing-library/react'
import { PaymentLockNote, usePaymentLock } from './PaymentLockNote'

const getCustomerLock = vi.fn()
vi.mock('../lib/api/payments', () => ({ getCustomerLock: (...a: unknown[]) => getCustomerLock(...a) }))

const lock = (o: Record<string, unknown>) => ({ locked: false, released: false, priorBills: [], total: 0, oldestDays: 0, ...o })

test('a locked customer gets a red do-not-pack note', () => {
  render(<PaymentLockNote lock={lock({ locked: true, priorBills: [{}, {}], oldestDays: 5 }) as any} />)
  expect(screen.getByRole('alert')).toHaveTextContent('ค้างชำระ 2 บิล · 5 วัน — ห้ามแพ็ค/ส่ง จนกว่าจะจ่าย หรือหัวหน้าปลดให้')
})

test('nothing when unlocked or released', () => {
  const { container, rerender } = render(<PaymentLockNote lock={lock({}) as any} />)
  expect(container).toBeEmptyDOMElement()
  rerender(<PaymentLockNote lock={lock({ released: true, priorBills: [{}] }) as any} />)
  expect(container).toBeEmptyDOMElement()
  rerender(<PaymentLockNote lock={null} />)
  expect(container).toBeEmptyDOMElement()
})

function Probe({ ship }: { ship: string | null }) {
  const l = usePaymentLock({ customer_phone: '01', customer_name_en: 'A' }, ship)
  return <p>{l === null ? 'none' : l.locked ? 'locked' : 'open'}</p>
}

test('usePaymentLock loads the lock for the delivery; nothing without a date', async () => {
  getCustomerLock.mockResolvedValue(lock({ locked: true, priorBills: [{}] }))
  const { rerender } = render(<Probe ship={null} />)
  expect(screen.getByText('none')).toBeInTheDocument()
  rerender(<Probe ship="2026-10-12" />)
  expect(await screen.findByText('locked')).toBeInTheDocument()
  expect(getCustomerLock).toHaveBeenCalledWith({ customer_phone: '01', customer_name_en: 'A' }, '2026-10-12')
})
