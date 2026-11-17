import { render, screen, within } from '@testing-library/react'
import { DeliveryNoteSheet } from './DeliveryNoteSheet'
import type { DeliveryNote } from '../lib/deliveryNote'

const note: DeliveryNote = {
  orderNo: '8545965612A',
  customerName: 'ร้านพยามมินิมาร์ท',
  memberCard: '076 04289130 130',
  invoiceNo: 'INV-77',
  shipDate: '2026-11-17',
  island: 'myanmar',
  boatName: 'ไต๋แขก 1',
  boxes: { paper: 3, foam: 1, piece: 2 },
  syncedAt: '2026-11-17T02:25:00Z',
  items: [
    { lineNo: 1, itemId: '100516', productName: 'ชเวปส์ มะนาวโซดา', barcodes: ['2500001005168', '8855199532670'], ordered: 4, shipped: 4, isShort: false },
    { lineNo: 2, itemId: '32825', productName: 'ขาไก่ 1 กก.', barcodes: [], ordered: 3, shipped: 1, isShort: true },
  ],
}

test('Thai note: header facts, maker barcode instead of Makro own, 6-digit fallback, short highlighted', () => {
  render(<DeliveryNoteSheet note={note} lang="th" />)
  expect(screen.getByText('ใบส่งของ')).toBeInTheDocument()
  expect(screen.getAllByText('8545965612A').length).toBeGreaterThan(0)
  expect(screen.getByText('076 04289130 130')).toBeInTheDocument()
  expect(screen.getByText('INV-77')).toBeInTheDocument()
  expect(screen.getByText('6')).toBeInTheDocument() // 3 + 1 + 2 packages

  const rows = screen.getAllByRole('row').slice(2) // the "whose note" line, then the headings
  expect(within(rows[0]).getByText('8855199532670')).toBeInTheDocument()
  expect(within(rows[0]).queryByText('2500001005168')).not.toBeInTheDocument()
  expect(within(rows[1]).getByText('32825')).toHaveClass('alone')
  expect(rows[1]).toHaveClass('dn-row-short')
  expect(rows[1].querySelector('.dn-short')).toHaveTextContent('2') // short 3 - 1
  expect(screen.getByText(/17\/11\/2026 09:25/)).toBeInTheDocument()
})

test('Myanmar note: Myanmar headings with English, product names stay Thai', () => {
  render(<DeliveryNoteSheet note={note} lang="my" />)
  expect(screen.getByRole('article')).toHaveAttribute('lang', 'my')
  expect(screen.getByText('ပစ္စည်းပို့လွှာ')).toBeInTheDocument()
  expect(screen.getAllByText('DELIVERY NOTE').length).toBeGreaterThan(0)
  expect(screen.getByText('ชเวปส์ มะนาวโซดา')).toBeInTheDocument()
  expect(screen.getByText(/မြန်မာ \(Myanmar\)/)).toBeInTheDocument()
})
