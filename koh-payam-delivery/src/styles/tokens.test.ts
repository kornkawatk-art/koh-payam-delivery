import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8')
const config = readFileSync(resolve(__dirname, '../../tailwind.config.js'), 'utf8')

const varsIn = (selector: string) => {
  const start = css.indexOf(selector + ' {')
  expect(start, `missing block ${selector}`).toBeGreaterThan(-1)
  const body = css.slice(start, css.indexOf('}', start))
  return new Set([...body.matchAll(/(--c-[a-z-]+)\s*:/g)].map((m) => m[1]))
}

test('every colour token has a light and a dark value', () => {
  const light = varsIn(':root')
  const dark = varsIn("html[data-theme='dark']")
  expect(light.size).toBeGreaterThan(20)
  expect([...dark].sort()).toEqual([...light].sort())
})

test('Tailwind colours come from the variables (no hex), and the per-menu accents are gone', () => {
  const colors = config.slice(config.indexOf('colors:'), config.indexOf('borderRadius'))
  expect(colors).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  expect(colors).not.toMatch(/accent/)
})
