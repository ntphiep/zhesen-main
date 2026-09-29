/** The Chinese answer writes itself on its grid: each distinct character once, 17 strokes at
 *  most, then the drawing clears back to the set glyph. hanzi-writer loads on the first
 *  call and fetches stroke data from its CDN. Nothing runs under reduced motion. */

interface Writer { animateCharacter(): Promise<unknown>; pauseAnimation(): Promise<unknown>; resumeAnimation(): Promise<unknown> }

const MAX_STROKES = 17
let token = 0
let writers: Writer[] = []
let listening = false

export function stopWriting(word?: HTMLElement | null): void {
  token++
  writers.forEach((w) => void w.pauseAnimation().catch(() => {}))
  writers = []
  if (!word) return
  word.querySelectorAll<HTMLElement>('[data-hz]').forEach((h) => h.replaceChildren())
  delete word.dataset.drawing
}

export async function writeWord(word: HTMLElement): Promise<void> {
  stopWriting(word)
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !word.isConnected) return
  const cells = [...word.querySelectorAll<HTMLElement>('[data-c]')]
  if (!cells.length) return
  const mine = token
  const { default: HanziWriter } = await import('hanzi-writer')
  if (!listening) {
    listening = true
    document.addEventListener('visibilitychange', () => {
      writers.forEach((w) => void (document.hidden ? w.pauseAnimation() : w.resumeAnimation()).catch(() => {}))
    })
  }
  const chars = cells.map((c) => c.dataset.c ?? '')
  const distinct = [...new Set(chars)]
  const counts = await Promise.all(distinct.map((c) => HanziWriter.loadCharacterData(c).then((d) => d?.strokes.length ?? 99, () => 99)))
  if (mine !== token) return
  const drawn = new Set<string>()
  let sum = 0
  distinct.forEach((c, i) => {
    if (counts[i] < 99 && (i === 0 || sum + counts[i] <= MAX_STROKES)) { drawn.add(c); sum += counts[i] } else sum = 99
  })
  if (!drawn.size) return
  word.dataset.drawing = ''
  const color = getComputedStyle(word).color
  const animated: Writer[] = []
  cells.forEach((cell, i) => {
    const c = chars[i], animate = drawn.has(c) && chars.indexOf(c) === i
    const size = cell.clientWidth
    const host = cell.querySelector<HTMLElement>('[data-hz]')
    if (!host) return
    const w = HanziWriter.create(host, c, {
      width: size, height: size, padding: size * 0.06, showOutline: animate, showCharacter: !animate,
      strokeColor: color, outlineColor: 'rgba(255,255,255,0.28)', strokeAnimationSpeed: 2.6, delayBetweenStrokes: 70,
    })
    if (animate) animated.push(w)
  })
  writers = animated
  for (const w of animated) {
    if (mine !== token) return
    await w.animateCharacter()
  }
  if (mine !== token) return
  delete word.dataset.drawing
  setTimeout(() => {
    if (mine !== token) return
    cells.forEach((c) => c.querySelector('[data-hz]')?.replaceChildren())
    writers = []
  }, 220)
}
