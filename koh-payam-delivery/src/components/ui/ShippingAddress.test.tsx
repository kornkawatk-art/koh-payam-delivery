import { render, screen } from '@testing-library/react'
import { ShippingAddress } from './ShippingAddress'

test('shows each distinct address once, so a combined pack lists the shop once', () => {
  render(
    <ShippingAddress
      addresses={['ซิกกี้ รีสอร์ท ท่าเทียบเรือไต๋แขก', ' ซิกกี้ รีสอร์ท ท่าเทียบเรือไต๋แขก ', null]}
    />,
  )
  expect(screen.getAllByText('ซิกกี้ รีสอร์ท ท่าเทียบเรือไต๋แขก')).toHaveLength(1)
  expect(screen.getByText(/ที่อยู่จัดส่งจากแม็คโคร/)).toBeInTheDocument()
})

test('renders nothing for orders imported before addresses were kept', () => {
  const { container } = render(<ShippingAddress addresses={[null, undefined, '  ']} />)
  expect(container).toBeEmptyDOMElement()
})
