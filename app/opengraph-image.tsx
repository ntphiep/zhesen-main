import { ImageResponse } from 'next/og'
import { googleFont } from '@/lib/og/googleFont'
import { SITE_CARD_ALT, SITE_DESCRIPTION } from '@/lib/site'
import { ZMark } from '@/components/layout/ZMark'

// The share card of every page without its own; the word page draws one per word.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = SITE_CARD_ALT

// Satori reads no CSS variables: the `--sea-*` ramp of app/globals.css, written out.
const SEA_300 = '#45c2db'
const SEA_500 = '#0090bf'
const SEA_700 = '#023c85'
const TINT_2 = '#e4f4f8'

export default async function Image() {
  // A failed fetch leaves next/og's own face rather than no image.
  const fonts = await googleFont('Be Vietnam Pro', [500, 800], 'Zhesen' + SITE_DESCRIPTION).catch(() => [])
  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', height: '100%', padding: '0 96px', background: '#fff', fontFamily: 'Be Vietnam Pro', position: 'relative' }}>
        <div style={{ position: 'absolute', top: -180, right: -160, width: 560, height: 560, borderRadius: 9999, background: TINT_2 }} />
        {/* The mark as the Z, one cap height (0.74em) tall, as in components/layout/SiteHeader.tsx.
            Satori does not baseline-align an svg: at line-height 1 Be Vietnam Pro's cap top
            sits 0.1275em below the box top (ascent 1, descent 0.265). */}
        <div style={{ display: 'flex', alignItems: 'flex-start', fontSize: 168, fontWeight: 800, letterSpacing: -3.4, lineHeight: 1 }}>
          <div style={{ display: 'flex', marginTop: 21 }}><ZMark fills={[SEA_300, SEA_500, SEA_700]} height={124} /></div>
          <div style={{ display: 'flex', marginLeft: 4, backgroundImage: `linear-gradient(90deg, ${SEA_300}, ${SEA_500}, ${SEA_700})`, backgroundClip: 'text', color: 'transparent' }}>
            hesen
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: 48, maxWidth: 940, color: '#000', fontSize: 44, fontWeight: 500, lineHeight: 1.35 }}>
          {SITE_DESCRIPTION}
        </div>
      </div>
    ),
    { ...size, ...(fonts.length > 0 ? { fonts } : {}) },
  )
}
