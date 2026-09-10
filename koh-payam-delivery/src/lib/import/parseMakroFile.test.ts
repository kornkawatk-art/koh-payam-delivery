import { readFileSync } from 'node:fs'
import { parseMakroFile } from './parseMakroFile'

test('parses csv rows keyed by header', async () => {
  const buf = readFileSync('src/test/fixtures/makro-sample.csv')
  const rows = await parseMakroFile(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  )
  expect(rows).toHaveLength(3)
  expect(rows[0]).toMatchObject({
    'Order No': 'PO-1001',
    Customer: 'BLUE VIEW RESORT',
    Qty: '10',
  })
})
