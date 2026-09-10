import { logAction } from './audit'

const insert = vi.fn()
const getUser = vi.fn()

vi.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
    from: (...a: unknown[]) => {
      from(...a)
      return { insert: (...b: unknown[]) => insert(...b) }
    },
  },
}))
const from = vi.fn()

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  insert.mockReset().mockResolvedValue({ error: null })
  getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } } })
  from.mockClear()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
})

test('logAction inserts an audit_logs row with the current user id', async () => {
  await logAction('status_change', 'order', 'o1', { from: 'imported', to: 'packed' })
  expect(from).toHaveBeenCalledWith('audit_logs')
  expect(insert).toHaveBeenCalledWith({
    user_id: 'u1',
    action: 'status_change',
    entity_type: 'order',
    entity_id: 'o1',
    meta: { from: 'imported', to: 'packed' },
  })
})

test('logAction swallows errors returned by supabase insert', async () => {
  insert.mockResolvedValueOnce({ error: { message: 'boom' } })
  await expect(logAction('x', 'order', 'o1')).resolves.toBeUndefined()
  expect(warnSpy).toHaveBeenCalled()
})

test('logAction swallows a thrown error', async () => {
  getUser.mockRejectedValueOnce(new Error('network down'))
  await expect(logAction('x', 'order', 'o1')).resolves.toBeUndefined()
  expect(warnSpy).toHaveBeenCalled()
})
