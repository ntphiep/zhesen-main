import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Zhesen',
    short_name: 'Zhesen',
    description: 'Tra từ tiếng Trung, Tây Ban Nha, Anh với tiếng Việt rồi lưu vào sổ tay để ôn.',
    start_url: '/',
    display: 'standalone',
    // --zs-bg and --sea-700 (--zs-ink) in app/globals.css.
    background_color: '#ffffff',
    theme_color: '#023c85',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }
}
