import type { MetadataRoute } from 'next'
import { SITE_DESCRIPTION } from '@/lib/site'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Zhesen',
    short_name: 'Zhesen',
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    // --zs-bg and --sea-700 (--zs-ink) in app/globals.css.
    background_color: '#ffffff',
    theme_color: '#023c85',
    // The maskable PNG keeps the mark inside Android's safe circle, 40% of the side.
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
