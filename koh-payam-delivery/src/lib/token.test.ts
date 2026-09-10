import { makeLinkToken } from './token'

test('produces an o_ prefixed 32 hex char token', () => {
  expect(makeLinkToken()).toMatch(/^o_[0-9a-f]{32}$/)
})

test('two calls are not equal', () => {
  expect(makeLinkToken()).not.toBe(makeLinkToken())
})
