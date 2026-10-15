import { movableNos } from './postponed'

const row = (no: string, ship_date: string, status: string) => ({ id: no + ship_date, makro_order_no: no, ship_date, status })

test('a PO still waiting on one earlier day can move; a delivered or duplicated one cannot', () => {
  const nos = movableNos([
    row('A', '2026-10-15', 'imported'),
    row('B', '2026-10-15', 'packed'),
    row('C', '2026-10-15', 'at_pier'),
    row('D', '2026-10-15', 'shipped'),
    row('E', '2026-10-15', 'picked_up'),
    row('F', '2026-10-14', 'imported'),
    row('F', '2026-10-15', 'imported'),
  ])
  expect([...nos].sort()).toEqual(['A', 'B', 'C'])
})
