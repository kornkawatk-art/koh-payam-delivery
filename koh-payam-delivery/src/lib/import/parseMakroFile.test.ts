// @vitest-environment node
// SheetJS decodes UTF-8 CSV bytes correctly only outside jsdom; these are pure
// data-layer tests with no DOM, so run them in the node environment.
import { readFileSync } from 'node:fs'
import { parseMakroFile, detectFileKind } from './parseMakroFile'

function ab(path: string): ArrayBuffer {
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

test('detectFileKind recognises the detail (OrderDetailExport) shape', () => {
  const headers = [
    'Order Number',
    'Item Id',
    'Product Name',
    'Order Quantity',
    'Shipped Quantity',
  ]
  expect(detectFileKind(headers)).toBe('detail')
})

test('detectFileKind recognises the order (OrderExport) shape', () => {
  const headers = ['Order Number', 'Customer Name', 'Sub District', 'Shipping Address', 'District']
  expect(detectFileKind(headers)).toBe('order')
})

test('detectFileKind returns unknown for an unrelated file', () => {
  expect(detectFileKind(['Foo', 'Bar', 'Baz'])).toBe('unknown')
})

test('parses the order-detail fixture, one row per line keyed by header', async () => {
  const rows = await parseMakroFile(ab('src/test/fixtures/order-detail-sample.csv'))
  expect(rows).toHaveLength(8)
  expect(detectFileKind(Object.keys(rows[0]))).toBe('detail')
  expect(rows[0]).toMatchObject({
    'Order Number': 'P-001',
    'Item Id': '100001',
    'Product Name': 'ข้าวสาร 5kg',
    'Order Quantity': '10',
    'Shipped Quantity': '10',
  })
  expect(rows[3]).toMatchObject({
    'Order Number': 'P-002',
    'Shipped Quantity': '5.43',
    'Shortage Quantity': '0.57',
  })
})

test('parses the order-export fixture with the address columns intact', async () => {
  const rows = await parseMakroFile(ab('src/test/fixtures/order-export-sample.csv'))
  expect(rows).toHaveLength(5)
  expect(detectFileKind(Object.keys(rows[0]))).toBe('order')
  expect(rows[2]).toMatchObject({
    'Order Number': 'P-003',
    'Sub District': 'ปากน้ำ',
    'Shipping Address': '88 Tai kak Khao Niwet Road',
    'Original Expected Date': '11-Sep-2026 - 11-Sep-2026',
  })
})
