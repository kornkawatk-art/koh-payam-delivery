import { buildStickerJobs, printedSnapshot } from './bulkStickers'

const o = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  makro_order_no: 'PO-' + id,
  customer_name_en: 'JJ Payam',
  customer_phone: '0826289533',
  island: 'payam',
  status: 'packed',
  makro_order_status: 'Delivered',
  paper_box_count: 1,
  foam_box_count: 1,
  piece_count: 0,
  stickers_printed: null as string | null,
  ...extra,
})

test('one job per customer, counts summed across their POs', () => {
  const [job] = buildStickerJobs([o('1'), o('2', { customer_phone: '082-628-9533', paper_box_count: 2, foam_box_count: 0 })])
  expect(job.counts).toEqual({ paper: 3, foam: 1, piece: 0 })
  expect(job.orders.map((x) => x.id)).toEqual(['1', '2'])
  expect(job.printed).toBe(false)
})

test('only packed / at-pier orders with boxes; not Makro-voided, not shipped or collected', () => {
  const jobs = buildStickerJobs([
    o('a', { customer_name_en: 'A', status: 'imported' }),
    o('b', { customer_name_en: 'B', status: 'shipped' }),
    o('c', { customer_name_en: 'C', status: 'picked_up' }),
    o('d', { customer_name_en: 'D', makro_order_status: 'Canceled' }),
    o('e', { customer_name_en: 'E', paper_box_count: 0, foam_box_count: 0 }),
    o('f', { customer_name_en: 'F', status: 'at_pier' }),
    o('g', { customer_name_en: 'G', is_pickup: true }),
  ])
  expect(jobs.map((j) => j.name)).toEqual(['F', 'G'])
})

test('printed while the counts still match what was printed; editing a count makes it due again', () => {
  const printed = o('1', { stickers_printed: '1,1,0' })
  expect(buildStickerJobs([printed])[0].printed).toBe(true)
  expect(buildStickerJobs([{ ...printed, foam_box_count: 2 }])[0].printed).toBe(false)
  expect(printedSnapshot({ paper_box_count: 2, foam_box_count: 0, piece_count: 3 })).toBe('2,0,3')
})

test('sorted by island (Payam, Chang, unpicked last) then customer name', () => {
  const jobs = buildStickerJobs([
    o('1', { customer_name_en: 'Zed', customer_phone: '01' }),
    o('2', { customer_name_en: 'Bay', customer_phone: '02', island: 'chang' }),
    o('3', { customer_name_en: 'Ann', customer_phone: '03' }),
    o('4', { customer_name_en: 'Pier', customer_phone: '04', island: null }),
  ])
  expect(jobs.map((j) => j.name)).toEqual(['Ann', 'Zed', 'Bay', 'Pier'])
})
