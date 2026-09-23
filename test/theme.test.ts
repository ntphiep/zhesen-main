import { describe, it, expect, afterEach } from 'vitest'
import {
  parseTheme, resolveTheme, currentScheme, watchScheme, THEME_BOOT_SCRIPT, THEME_KEY,
} from '@/lib/theme'

afterEach(() => {
  delete document.documentElement.dataset.theme
  localStorage.clear()
})

describe('theme choice', () => {
  it('falls back to the system scheme for anything it does not recognise', () => {
    expect(parseTheme('dark')).toBe('dark')
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme(null)).toBe('system')
    expect(parseTheme('{"broken":true}')).toBe('system')
  })

  it('resolves "system" against the browser and leaves a real choice alone', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    // The point of storing a choice: a dark machine still renders light on request.
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('the scheme in force', () => {
  it('reads the attribute the page is painted from, not the media query', () => {
    document.documentElement.dataset.theme = 'dark'
    expect(currentScheme()).toBe('dark')
    document.documentElement.dataset.theme = 'light'
    expect(currentScheme()).toBe('light')
  })

  it('treats a missing attribute as light, which is what the CSS paints', () => {
    expect(currentScheme()).toBe('light')
  })

  it('reports a flip to whoever cannot use a CSS variable', () => {
    const seen: string[] = []
    const unwatch = watchScheme((s) => seen.push(s))
    document.documentElement.dataset.theme = 'dark'
    return Promise.resolve().then(() => {
      expect(seen).toEqual(['dark'])
      unwatch()
      document.documentElement.dataset.theme = 'light'
      return Promise.resolve().then(() => expect(seen).toEqual(['dark']))
    })
  })
})

describe('the boot script', () => {
  // It runs in <head> before the body exists, so it is evaluated here as the browser
  // would evaluate it rather than imported.
  it('writes the stored choice onto <html> before the first paint', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    new Function(THEME_BOOT_SCRIPT)()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('resolves an absent choice against the browser', () => {
    new Function(THEME_BOOT_SCRIPT)()
    // jsdom's matchMedia reports no match, so "system" lands on light.
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
