import { render, screen } from '@testing-library/react'
import { AppLogo } from './AppLogo'

test('the logo is one labelled image at the requested size', () => {
  render(<AppLogo size={36} />)
  const img = screen.getByRole('img', { name: 'ระบบจัดส่งเกาะ' })
  expect(img).toHaveAttribute('width', '36')
  expect(img).toHaveAttribute('height', '36')
})

test('two logos on one page do not share a gradient id', () => {
  const { container } = render(
    <>
      <AppLogo size={36} />
      <AppLogo size={44} />
    </>,
  )
  const ids = Array.from(container.querySelectorAll('linearGradient')).map((g) => g.id)
  expect(new Set(ids).size).toBe(2)
})
