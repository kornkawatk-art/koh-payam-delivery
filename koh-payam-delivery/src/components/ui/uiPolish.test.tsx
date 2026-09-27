import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Package } from '@phosphor-icons/react'
import { PageHeader } from './PageHeader'
import { EmptyState } from './EmptyState'
import { PageSkeleton } from './Skeleton'
import { Notice, flash } from './Notice'

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

test('Notice: errors are announced as alerts, successes as status, each with its own tone', () => {
  const { rerender } = render(<Notice flash={flash.error('บันทึกไม่สำเร็จ')} />)
  expect(screen.getByRole('alert')).toHaveClass('alert-danger')
  rerender(<Notice flash={flash.ok('บันทึกแล้ว')} />)
  expect(screen.getByRole('status')).toHaveClass('alert-ok')
  rerender(<Notice flash={flash.warn('บันทึกแล้ว แต่ส่งลิงก์ไม่สำเร็จ')} />)
  expect(screen.getByRole('status')).toHaveClass('alert-warn')
  rerender(<Notice flash={undefined} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
