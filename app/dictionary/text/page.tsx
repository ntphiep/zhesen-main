import { Suspense } from 'react'
import Link from 'next/link'
import { TextLookup } from '@/components/search/TextLookup'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Tra cả đoạn',
  description: 'Tra một cụm từ, một câu hoặc cả đoạn văn: từng từ một, kèm bản dịch cả đoạn.',
})

/**
 * Reached from the lookup box, which offers it as soon as the query stops being one word.
 *
 * `?q=` is read inside `TextLookup` rather than here. Reading `searchParams` in a page
 * opts it into dynamic rendering at request time
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md:119`),
 * and this page holds a text box and nothing else worth a server round trip: the shell
 * ships from the CDN and the lookup fills in.
 */
export default function Page() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/dictionary" prefetch={false} className="text-sm text-black/50 hover:text-black">
        Tra cứu
      </Link>
      <h1 className="mt-2 text-3xl font-bold">Tra cả đoạn</h1>
      <p className="mt-1 text-sm text-black/60">
        Từng từ được tra trong từ điển. Bản dịch cả đoạn do trợ lý làm, nếu bản triển khai
        này có trợ lý.
      </p>
      <div className="mt-6">
        <Suspense>
          <TextLookup />
        </Suspense>
      </div>
    </main>
  )
}
