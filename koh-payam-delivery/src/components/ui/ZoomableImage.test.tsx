import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ZoomableImage } from './ZoomableImage'

test('renders a thumbnail', () => {
  render(<ZoomableImage src="https://example.com/a.jpg" alt="หลักฐาน" />)
  const thumb = screen.getByAltText('หลักฐาน') as HTMLImageElement
  expect(thumb).toBeInTheDocument()
  expect(thumb.src).toBe('https://example.com/a.jpg')
})

test('clicking the thumbnail shows an enlarged overlay', async () => {
  render(<ZoomableImage src="https://example.com/a.jpg" alt="หลักฐาน" />)
  expect(screen.getAllByAltText('หลักฐาน')).toHaveLength(1)

  await userEvent.click(screen.getByRole('button', { name: 'หลักฐาน' }))

  const images = screen.getAllByAltText('หลักฐาน')
  expect(images).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'ปิด' })).toBeInTheDocument()
})

test('clicking the overlay backdrop dismisses it', async () => {
  render(<ZoomableImage src="https://example.com/a.jpg" alt="หลักฐาน" />)
  await userEvent.click(screen.getByRole('button', { name: 'หลักฐาน' }))
  expect(screen.getAllByAltText('หลักฐาน')).toHaveLength(2)

  // The backdrop is the enlarged image's parent container.
  const enlarged = screen.getAllByAltText('หลักฐาน')[1]
  await userEvent.click(enlarged.parentElement as HTMLElement)

  expect(screen.getAllByAltText('หลักฐาน')).toHaveLength(1)
})

test('clicking the close button dismisses the overlay', async () => {
  render(<ZoomableImage src="https://example.com/a.jpg" alt="หลักฐาน" />)
  await userEvent.click(screen.getByRole('button', { name: 'หลักฐาน' }))
  expect(screen.getAllByAltText('หลักฐาน')).toHaveLength(2)

  await userEvent.click(screen.getByRole('button', { name: 'ปิด' }))

  expect(screen.getAllByAltText('หลักฐาน')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'ปิด' })).not.toBeInTheDocument()
})
