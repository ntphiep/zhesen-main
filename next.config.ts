import type { NextConfig } from 'next'

/**
 * Security headers. The app had none: no CSP, no frame protection, no HSTS, so
 * /account could be framed and covered by an attacker's own page.
 *
 * Every host below is in the list because something in this app actually asks
 * for it, and nothing else is:
 *  - Supabase, read from the same variable the browser client uses, is where
 *    every dictionary and notebook request goes (lib/supabase/client.ts).
 *  - cdn.jsdelivr.net is where hanzi-writer fetches its stroke data by
 *    XMLHttpRequest, so it belongs to connect-src, not script-src. Leave it out
 *    and components/lookup/StrokeOrder.tsx hides itself instead of failing
 *    loudly.
 *  - upload.wikimedia.org serves the pronunciation recordings. `new Audio(url)`
 *    is governed by media-src, not connect-src; putting it in the wrong one
 *    silences all 699 recordings. There is no second host: counted over
 *    lex.pronunciations, every non-null audio_url is on that one.
 * There is no <img> or next/image anywhere, so img-src needs no remote host.
 *
 * `speechSynthesis` is not subject to CSP at all -- it plays voices installed on
 * the machine and issues no request. Speech *recognition* does need permission,
 * which is why Permissions-Policy keeps microphone=(self); denying it makes the
 * speaking drill silently hear nothing.
 *
 * script-src keeps 'unsafe-inline' because the build emits inline <script> tags
 * for React's hydration payload. The alternative is a per-request nonce, and a
 * nonce forces every page to render dynamically, which would give up both the
 * prerendering and the CDN cache the search route is built around.
 */

// A missing variable is already fatal at runtime (lib/supabase/env.ts asserts it),
// so falling back to the empty string here only keeps `next build` from dying with
// a less useful message.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin
  } catch {
    return ''
  }
})()

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self' https://upload.wikimedia.org",
  `connect-src 'self' https://cdn.jsdelivr.net${supabaseOrigin ? ` ${supabaseOrigin}` : ''}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

const nextConfig: NextConfig = {
  // The header names the framework and version to anyone scanning. It buys the
  // visitor nothing.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
  // /dictionary/reverse was a page of its own for one release and sat on the header, so
  // it is in bookmarks and in history. The lookup box now answers both directions, and a
  // 404 would be a worse answer than the page that replaced it.
  async redirects() {
    return [{ source: '/dictionary/reverse', destination: '/dictionary', permanent: true }]
  },
}

export default nextConfig
