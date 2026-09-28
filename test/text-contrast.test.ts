import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** The lightest ink allowed for text, as the alpha of `text-black/<n>`. */
const FLOOR = 55
/** Below the floor and not decoration: `text-black/25` is kept for an aria-hidden separator. */
const MUTED = /(?<![\w-])text-black\/(3\d|4\d|5[0-4])(?!\d)/g

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
/** WCAG contrast of ink at `alpha` over a grey ground, both on the 0..1 scale. */
function contrast(ink: number, ground: number, alpha: number): number {
  const fg = lin(ink * alpha + ground * (1 - alpha))
  const bg = lin(ground)
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

describe('muted text contrast', () => {
  // text-black/40 measured 2.83:1 and text-black/50 3.94:1 against the AA 4.5:1.
  it('reaches 4.5:1 at the floor on every page ground, light and dark', () => {
    const a = FLOOR / 100
    expect(contrast(0, 1, a)).toBeGreaterThanOrEqual(4.5) // paper
    expect(contrast(0, 1 - 0.035, a)).toBeGreaterThanOrEqual(4.5) // the overview's grey page
    expect(contrast(0, 1 - 0.05, a)).toBeGreaterThanOrEqual(4.5) // a bg-black/5 chip
    expect(contrast(1, 0x17 / 255, a)).toBeGreaterThanOrEqual(4.5) // dark paper
    expect(contrast(1, 0x0a / 255, a)).toBeGreaterThanOrEqual(4.5) // dark background
  })

  it('uses no ink lighter than the floor for text', () => {
    const found = ['app', 'components'].flatMap(files).flatMap((path) =>
      readFileSync(path, 'utf8').split('\n').flatMap((line, i) =>
        [...line.matchAll(MUTED)].map((m) => `${path}:${i + 1} ${m[0]}`)))
    expect(found).toEqual([])
  })
})
