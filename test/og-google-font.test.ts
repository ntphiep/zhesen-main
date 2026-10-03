import { describe, it, expect } from 'vitest'
import { parseFontFaces } from '@/lib/og/googleFont'

// The shape css2 answered to a request with `text=` and no browser User-Agent.
const CSS = `@font-face {
  font-family: 'Be Vietnam Pro';
  font-style: normal;
  font-weight: 500;
  src: url(https://fonts.gstatic.com/l/font?kit=a500&skey=k&v=v12) format('truetype');
}
@font-face {
  font-family: 'Be Vietnam Pro';
  font-style: normal;
  font-weight: 800;
  src: url(https://fonts.gstatic.com/l/font?kit=a800&skey=k&v=v12) format('truetype');
}
@font-face {
  font-family: 'Be Vietnam Pro';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/x.woff2) format('woff2');
}`

describe('parseFontFaces', () => {
  it('reads each TrueType face with its weight and skips formats Satori cannot read', () => {
    expect(parseFontFaces(CSS)).toEqual([
      { weight: 500, src: 'https://fonts.gstatic.com/l/font?kit=a500&skey=k&v=v12' },
      { weight: 800, src: 'https://fonts.gstatic.com/l/font?kit=a800&skey=k&v=v12' },
    ])
  })

  it('finds nothing in an error page', () => {
    expect(parseFontFaces('<html>400 Bad Request</html>')).toEqual([])
  })
})
