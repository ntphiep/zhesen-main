import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Zhesen',
    short_name: 'Zhesen',
    description: 'Tra từ tiếng Anh, Trung, Tây Ban Nha với tiếng Việt rồi lưu vào sổ tay để ôn.',
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
