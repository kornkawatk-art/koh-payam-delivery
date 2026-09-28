import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotoGallery } from './PhotoGallery'

const photos = [
  { src: 'https://x/a.jpg', alt: 'A' },
  { src: 'https://x/b.jpg', alt: 'B' },
  { src: 'https://x/c.jpg', alt: 'C' },
]
const shown = () => screen.getByRole('dialog').querySelector('img')!.getAttribute('src')

test('tapping a thumbnail opens that photo with an "n / total" counter', async () => {
  render(<PhotoGallery photos={photos} />)
  await userEvent.click(screen.getAllByRole('button')[1])
  expect(shown()).toBe('https://x/b.jpg')
  expect(screen.getByText('2 / 3')).toBeInTheDocument()
})

test('arrow buttons move through the set and wrap around at both ends', async () => {
  render(<PhotoGallery photos={photos} />)
  await userEvent.click(screen.getAllByRole('button')[2])
  await userEvent.click(screen.getByRole('button', { name: 'รูปถัดไป' }))
  expect(shown()).toBe('https://x/a.jpg') // wrapped past the last
  await userEvent.click(screen.getByRole('button', { name: 'รูปก่อนหน้า' }))
  expect(shown()).toBe('https://x/c.jpg') // and back
})

test('← / → keys move, Esc closes', async () => {
  render(<PhotoGallery photos={photos} />)
  await userEvent.click(screen.getAllByRole('button')[0])
  await userEvent.keyboard('{ArrowRight}')
  expect(shown()).toBe('https://x/b.jpg')
  await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
  expect(shown()).toBe('https://x/c.jpg')
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('a swipe left/right flips the photo and does not close the viewer', async () => {
  render(<PhotoGallery photos={photos} />)
  await userEvent.click(screen.getAllByRole('button')[0])
  const dialog = screen.getByRole('dialog')
  fireEvent.pointerDown(dialog, { clientX: 300 })
  fireEvent.pointerUp(dialog, { clientX: 150 }) // drag left -> next
  fireEvent.click(dialog) // the click a swipe produces on the backdrop
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(shown()).toBe('https://x/b.jpg')
  fireEvent.pointerDown(dialog, { clientX: 100 })
  fireEvent.pointerUp(dialog, { clientX: 260 }) // drag right -> previous
  expect(shown()).toBe('https://x/a.jpg')
})

test('a plain tap on the backdrop closes it; a tap on the photo does not', async () => {
  render(<PhotoGallery photos={photos} />)
  await userEvent.click(screen.getAllByRole('button')[0])
  await userEvent.click(screen.getByRole('dialog').querySelector('img')!)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('dialog'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('a single photo shows no arrows or counter', async () => {
  render(<PhotoGallery photos={[photos[0]]} />)
  await userEvent.click(screen.getByRole('button'))
  expect(screen.queryByRole('button', { name: 'รูปถัดไป' })).not.toBeInTheDocument()
  expect(screen.queryByText('1 / 1')).not.toBeInTheDocument()
})
