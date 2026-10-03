import { ImageResponse } from 'next/og'
import { getCachedEntryDetail } from '@/lib/dictionary/cached'
import { buildEntryId } from '@/lib/dictionary/entryId'
import { clip, headwordPinyin, vietnameseGlosses } from '@/lib/dictionary/entryMetadata'
import { percentDecode } from '@/lib/http/percentDecode'
import { getLanguage, isLangCode } from '@/lib/languages'
import { googleFont, type OgFont } from '@/lib/og/googleFont'

export const alt = 'Từ và nghĩa tiếng Việt trên Zhesen'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** As on the word page: rendered on first request, then kept for the data caches' week. */
export function generateStaticParams(): { lang: string; id: string }[] {
  return []
}
export const revalidate = 604800

// Satori reads no CSS variables: the `--sea-*` ramp of app/globals.css, written out.
const SEA_50 = '#c3e7ef'
const SEA_300 = '#45c2db'
const SEA_600 = '#0172b6'
const SEA_700 = '#023c85'
const TINT_2 = '#e4f4f8'

const BRAND = 'Zhesen'

/** Shorter headwords draw larger; a Han character is about two Latin letters wide. */
function headwordSize(headword: string, han: boolean): number {
  const width = [...headword].length * (han ? 2 : 1)
  return width <= 8 ? 150 : width <= 14 ? 112 : width <= 22 ? 84 : 64
}

/** Senses repeat terms ("Học, học tập" then "Học, học hỏi"); two lines of card hold each once. */
function distinctTerms(glosses: string[]): string[] {
  const seen = new Set<string>()
  return glosses.flatMap((g) => g.split(/,\s*/)).filter((t) => {
    const key = t.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** A missing face is drawn by next/og's own fallback, so one failed fetch costs looks, not the image. */
async function fonts(han: boolean, headword: string, rest: string): Promise<OgFont[]> {
  const loads = await Promise.allSettled([
    han ? googleFont('Noto Serif SC', [700], headword) : googleFont('Newsreader', [700], headword),
    googleFont('Be Vietnam Pro', [500, 800], rest),
  ])
  return loads.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

export default async function Image({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  const detail = language ? await getCachedEntryDetail(buildEntryId(language.code, percentDecode(id))) : null
  if (!language || !detail) return new Response(null, { status: 404 })

  const han = language.script === 'han'
  const pinyin = han ? headwordPinyin(detail) : null
  const gloss = clip(distinctTerms(vietnameseGlosses(detail)).join(', '), 90) || null
  const rest = [language.name, pinyin, gloss, BRAND].filter(Boolean).join(' ')
  const loaded = await fonts(han, detail.headword, rest)

  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: '64px 80px', background: '#fff', fontFamily: 'Be Vietnam Pro', position: 'relative' }}>
        <div style={{ position: 'absolute', top: -180, right: -160, width: 560, height: 560, borderRadius: 9999, background: TINT_2 }} />
        <div style={{ display: 'flex' }}>
          <div style={{ display: 'flex', padding: '8px 24px', borderRadius: 9999, background: SEA_50, color: SEA_700, fontSize: 28, fontWeight: 500 }}>
            {language.name}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flexGrow: 1 }}>
          <div style={{ display: 'flex', color: SEA_700, fontFamily: han ? 'Noto Serif SC' : 'Newsreader', fontWeight: 700, fontSize: headwordSize(detail.headword, han), lineHeight: 1.1 }}>
            {detail.headword}
          </div>
          {pinyin && <div style={{ display: 'flex', marginTop: 12, color: SEA_600, fontSize: 44, fontWeight: 500 }}>{pinyin}</div>}
          {gloss && <div style={{ display: 'flex', marginTop: 28, maxWidth: 1000, color: '#000', fontSize: 42, fontWeight: 500, lineHeight: 1.35 }}>{gloss}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: SEA_700, fontSize: 40, fontWeight: 800, letterSpacing: -0.8 }}>
          <div style={{ display: 'flex', gap: 4, height: 38 }}>
            <div style={{ width: 11, borderRadius: 3, background: SEA_700 }} />
            <div style={{ width: 11, borderRadius: 3, background: SEA_600 }} />
            <div style={{ width: 11, borderRadius: 3, background: SEA_300 }} />
          </div>
          {BRAND}
        </div>
      </div>
    ),
    // An empty list would replace next/og's default face and leave Satori with none.
    { ...size, ...(loaded.length > 0 ? { fonts: loaded } : {}) },
  )
}
