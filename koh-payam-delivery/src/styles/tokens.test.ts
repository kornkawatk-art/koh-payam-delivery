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

test('printing puts every light value back, so stickers from dark mode print the same', () => {
  const print = css.slice(css.indexOf('@media print'))
  const body = print.slice(print.indexOf("html[data-theme='dark'] {"), print.indexOf('}'))
  const lightBlock = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
  const pairs = (b: string) => [...b.matchAll(/(--c-[a-z-]+):\s*([\d ]+);/g)].map((m) => `${m[1]}=${m[2]}`).sort()
  expect(pairs(body)).toEqual(pairs(lightBlock))
  expect(pairs(body).length).toBeGreaterThan(20)
})
