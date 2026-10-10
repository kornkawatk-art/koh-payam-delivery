import { render, screen } from '@testing-library/react'
import { StatusBadge } from './StatusBadge'

test('"ส่งแล้ว" uses a solid badge so it reads apart from the soft-green "แพ็คแล้ว"', () => {
  render(
    <>
      <StatusBadge status="packed" />
      <StatusBadge status="shipped" />
    </>,
  )
  expect(screen.getByText('แพ็คแล้ว')).toHaveClass('badge-ok')
  expect(screen.getByText('ส่งแล้ว')).toHaveClass('badge-ok-solid')
  expect(screen.getByText('ส่งแล้ว')).not.toHaveClass('badge-ok')
})

test('a collected store pickup reads "ลูกค้ารับแล้ว" as a finished (solid) state', () => {
  render(<StatusBadge status="picked_up" />)
  expect(screen.getByText('ลูกค้ารับแล้ว')).toHaveClass('badge-ok-solid')
})
