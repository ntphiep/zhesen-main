import { SearchBox } from '@/components/search/SearchBox'
import { LANGUAGES, isLangCode } from '@/lib/languages'

/** What the box accepts, shown because none of it is guessable from an empty
 * field: that Vietnamese works as a query, that accents and tone marks are
 * optional, and that a misspelling still finds the word. */
const HINTS: { label: string; example: string }[] = [
  { label: 'Một từ ở bất kỳ ngôn ngữ nào', example: 'holy · hola · 有没有' },
  { label: 'Tiếng Việt, để tra ngược', example: 'con chó · thiêng liêng' },
  { label: 'Pinyin không dấu thanh', example: 'you mei you' },
  { label: 'Gõ sai hoặc thiếu dấu vẫn tìm được', example: 'comio · nino' },
]

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; lang?: string }> }) {
  const sp = await searchParams
  // `searchPath` (lib/dictionary/entryId.ts) appends the language, because a chip
  // for a related word or an inflected form already knows which language it came
  // from. Dropping it here made every such chip search all three.
  const lang = sp.lang && isLangCode(sp.lang) ? sp.lang : undefined
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-bold">Tra cứu</h1>
      <p className="mt-1 text-sm text-black/60">
        Gõ một từ tiếng Anh, Trung hoặc Tây Ban Nha — hệ thống tự nhận diện ngôn ngữ.
      </p>
      <div className="mt-6">
        <SearchBox initialQuery={sp.q ?? ''} lang={lang} autoFocus />
      </div>

      {!sp.q && (
        <section className="mt-10 flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-black/55">Có thể gõ gì</h2>
            <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {HINTS.map((h) => (
                <li key={h.label} className="flex flex-col">
                  <span className="text-sm text-black/70">{h.label}</span>
                  <span className="text-sm text-black/45">{h.example}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-black/55">Hoặc học theo ngôn ngữ</h2>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => (
                <a
                  key={l.code}
                  href={`/learn/${l.code}`}
                  className="rounded-lg border border-black/10 px-4 py-2 text-sm hover:bg-black/5"
                >
                  <span className="font-medium">{l.nativeName}</span>
                  <span className="ml-2 text-black/50">{l.name}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
