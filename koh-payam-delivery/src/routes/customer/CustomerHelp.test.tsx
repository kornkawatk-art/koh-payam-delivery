import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CustomerHelp from './CustomerHelp'

beforeEach(() => {
  try {
    localStorage.removeItem('cust_lang')
  } catch {
    /* ignore */
  }
})

const renderHelp = (from?: string) =>
  render(
    <MemoryRouter
      initialEntries={[{ pathname: '/help', state: from ? { from } : undefined }]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/help" element={<CustomerHelp />} />
        <Route path="/o/:token" element={<p>order page</p>} />
      </Routes>
    </MemoryRouter>,
  )

test('explains the link in English by default, section by section', () => {
  renderHelp()
  expect(screen.getByRole('heading', { level: 1, name: 'How to use your order link' })).toBeInTheDocument()
  for (const h of ['Order status', 'Your items', 'Photos of your boxes', 'Report a problem', 'Foam boxes'])
    expect(screen.getByRole('heading', { level: 2, name: h })).toBeInTheDocument()
})

test('switches to Thai and remembers it', async () => {
  renderHelp()
  await userEvent.click(screen.getByRole('button', { name: 'ไทย' }))
  expect(screen.getByRole('heading', { level: 1, name: 'วิธีใช้ลิงก์ติดตามออเดอร์' })).toBeInTheDocument()
  expect(localStorage.getItem('cust_lang')).toBe('th')
})

test('back goes to the order the customer came from', async () => {
  renderHelp('/o/tok_abc')
  await userEvent.click(screen.getByRole('link', { name: /Back to my order/ }))
  expect(screen.getByText('order page')).toBeInTheDocument()
})
