/** One face as `ImageResponse` takes it in `fonts`. */
export interface OgFont {
  name: string
  data: ArrayBuffer
  weight: OgWeight
  style: 'normal'
}

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const
type OgWeight = (typeof WEIGHTS)[number]

function isWeight(n: number): n is OgWeight {
  return (WEIGHTS as readonly number[]).includes(n)
}

const TIMEOUT_MS = 3000

/** Every `@font-face` of a css2 sheet as weight and file URL, TrueType or OpenType only. */
export function parseFontFaces(css: string): { weight: number; src: string }[] {
  return [...css.matchAll(/@font-face\s*{([^}]*)}/g)].flatMap(([, body]) => {
    const weight = /font-weight:\s*(\d+)/.exec(body)?.[1]
    const src = /src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/.exec(body)?.[1]
    return weight && src ? [{ weight: Number(weight), src }] : []
  })
}

async function fetchOk(url: string): Promise<Response> {
  // The subset is fixed by the URL, so the data cache may keep it for as long as it likes.
  const res = await fetch(url, { cache: 'force-cache', signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return res
}

/**
 * The faces of one Google Fonts family cut down to the glyphs of `text`, a few kB each.
 * css2 answers a request without a browser User-Agent with TrueType, which Satori reads;
 * a browser would get WOFF2, which it cannot.
 */
export async function googleFont(family: string, weights: number[], text: string): Promise<OgFont[]> {
  const url = `https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}:wght@${weights.join(';')}`
    + `&text=${encodeURIComponent(text)}`
  const faces = parseFontFaces(await (await fetchOk(url)).text())
  return Promise.all(faces.flatMap(({ weight, src }) => isWeight(weight) ? [load(family, weight, src)] : []))
}

async function load(name: string, weight: OgWeight, src: string): Promise<OgFont> {
  return { name, weight, style: 'normal', data: await (await fetchOk(src)).arrayBuffer() }
}
