/** Light or dark. The choice is stored; `data-theme` on <html> holds the resolved value
 *  and never "system", so `app/globals.css` carries one palette rather than one per
 *  media query. */

export type ThemeChoice = 'light' | 'dark' | 'system'
export type Scheme = 'light' | 'dark'

export const THEME_KEY = 'zhesen_theme'

/** In the order they are offered. "Theo hệ thống" is the default and comes last, where a
 *  segmented control puts the fallback. */
export const THEME_OPTIONS: [ThemeChoice, string][] = [
  ['light', 'Sáng'],
  ['dark', 'Tối'],
  ['system', 'Theo hệ thống'],
]

export function parseTheme(raw: string | null): ThemeChoice {
  return raw === 'light' || raw === 'dark' ? raw : 'system'
}

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): Scheme {
  if (choice === 'system') return prefersDark ? 'dark' : 'light'
  return choice
}

export const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The scheme the page is painted in right now. Anything that cannot take a CSS variable,
 *  such as a canvas, has to read this rather than the media query: with a choice stored,
 *  the two disagree and the drawing comes out invisible on its own background. */
export function currentScheme(): Scheme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

/** Calls back on every change of the painted scheme, including the one a flip of the OS
 *  setting causes while the choice is "system". Returns the unsubscribe. */
export function watchScheme(onChange: (scheme: Scheme) => void): () => void {
  const observer = new MutationObserver(() => onChange(currentScheme()))
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

/**
 * Runs in <head> before the first paint, so the page never renders light and then flips.
 * Kept to one statement with no dependencies because it is inlined into the document:
 * anything it needs would have to be parsed and run before the body exists.
 */
export const THEME_BOOT_SCRIPT =
  `(function(){try{var c=localStorage.getItem('${THEME_KEY}');` +
  `if(c!=='light'&&c!=='dark')c=window.matchMedia('${DARK_QUERY}').matches?'dark':'light';` +
  `document.documentElement.dataset.theme=c}catch(e){document.documentElement.dataset.theme='light'}})()`
