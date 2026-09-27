import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Package } from '@phosphor-icons/react'
import { PageHeader } from './PageHeader'
import { EmptyState } from './EmptyState'
import { PageSkeleton } from './Skeleton'

test('PageHeader with `back` renders an on-screen link to the parent page', () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PageHeader back={{ to: '/claims', label: 'คิวเคลม' }} title="เคลม · PO-1" />
    </MemoryRouter>,
  )
  expect(screen.getByRole('link', { name: 'คิวเคลม' })).toHaveAttribute('href', '/claims')
  expect(screen.getByRole('heading', { name: 'เคลม · PO-1' })).toBeInTheDocument()
})

test('EmptyState shows its message and the next-step hint', () => {
  render(<EmptyState icon={Package} title="ไม่มีออเดอร์" hint="เลือกวันอื่น" />)
  expect(screen.getByText('ไม่มีออเดอร์')).toBeInTheDocument()
  expect(screen.getByText('เลือกวันอื่น')).toBeInTheDocument()
})

test('PageSkeleton announces loading to screen readers', () => {
  render(<PageSkeleton />)
  expect(screen.getByRole('status')).toHaveTextContent('กำลังโหลด…')
})
