import { SearchBox } from '@/components/search/SearchBox'
import { LookupTabs } from '@/components/search/LookupTabs'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Tra từ tiếng Việt',
  description: 'Gõ một từ tiếng Việt và xem từ tương ứng trong tiếng Anh, Trung và Tây Ban Nha.',
})

/**
 * The reverse direction as a page of its own. `/dictionary` guesses which way a query
 * runs, so a Vietnamese word spelled without tone marks reaches the Vietnamese lookup
 * only after the forward search has scored badly enough. Here the direction is declared,
 * not guessed.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-bold">Tra từ tiếng Việt</h1>
      <p className="mt-1 text-sm text-black/60">
        Gõ tiếng Việt, nhận từ tương ứng trong tiếng Anh, Trung và Tây Ban Nha.
      </p>
      <div className="mt-6">
        <LookupTabs />
      </div>
      <div className="mt-6">
        <SearchBox initialQuery={sp.q ?? ''} direction="reverse" autoFocus />
      </div>
    </main>
  )
}
