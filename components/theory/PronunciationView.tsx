import Link from 'next/link'
import { AudioButton } from '@/components/ui/AudioButton'
import { searchPath } from '@/lib/dictionary/entryId'
import { BlockPage } from './BlockPage'
import type { Phoneme, PhonemeKind, PronunciationNote } from '@/lib/theory/types'
import type { Language } from '@/lib/languages'

const KIND_TITLE: Record<PhonemeKind, string> = {
  vowel: 'Nguyên âm',
  diphthong: 'Nguyên âm đôi',
  weak: 'Nguyên âm yếu',
  consonant: 'Phụ âm',
}

const KIND_ORDER: PhonemeKind[] = ['vowel', 'diphthong', 'weak', 'consonant']

/** `/theory/[lang]/pronunciation`: every sound of the language in one table, each one
 *  its own anchor so a transcription elsewhere can point at a single symbol. */
export function PronunciationView({ language, phonemes, notes }: {
  language: Language
  phonemes: readonly Phoneme[]
  notes: readonly PronunciationNote[]
}) {
  return (
    <BlockPage
      language={language}
      block="pronunciation"
      titleVi="Phát âm"
      leadVi={`${phonemes.length} ký hiệu, mỗi ký hiệu có ví dụ, những cách viết tạo ra nó và chỗ người Việt hay đọc chệch.`}
    >
      {/* Not sticky. 46 chips wrap to 182px at 390 and 114px at 1440, and pinning that
          much chrome either covered the card the reader had just clicked or, once capped,
          clipped 23 of the 46 chips into a box that needed its own scroll. */}
      <nav id="index" aria-label="Danh sách âm" className="-mx-2 mt-6 flex flex-wrap gap-1 px-2 py-2">
        {phonemes.map((p) => (
          <a
            key={p.symbol}
            href={`#${encodeURIComponent(p.symbol)}`}
            // 44px square: a symbol is one or two characters, so the box has to be sized
            // rather than fitted to the text, which left it 25.8 by 29.8 on a phone.
            className="ipa inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-black/10 px-2 text-sm hover:bg-black/5"
          >
            {p.symbol}
          </a>
        ))}
      </nav>

      {KIND_ORDER.map((kind) => {
        const ofKind = phonemes.filter((p) => p.kind === kind)
        if (ofKind.length === 0) return null
        return (
          <section key={kind} className="mt-10">
            <h2 className="text-xl font-semibold">
              {KIND_TITLE[kind]} <span className="text-base font-normal text-black/55">{ofKind.length} âm</span>
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              {ofKind.map((p) => <PhonemeCard key={p.symbol} phoneme={p} lang={language.code} />)}
            </div>
            {/* The page runs to about 21,800px on a phone and the index is not sticky, so
                each group ends with the way back to it. */}
            <a href="#index" className="mt-4 inline-block text-sm text-black/55 hover:underline">
              ↑ Bảng ký hiệu
            </a>
          </section>
        )
      })}

      {notes.length > 0 && (
        <section className="mt-12 flex flex-col gap-6">
          <h2 className="text-xl font-semibold">Ngoài từng âm</h2>
          {notes.map((n) => (
            <article key={n.id} id={n.id}>
              <h3 className="font-semibold">{n.titleVi}</h3>
              <p className="mt-1 whitespace-pre-line text-black/80">{n.bodyVi}</p>
              <ul className="mt-2 flex flex-col gap-1">
                {n.examples.map((e) => (
                  <li key={e.en} className="border-l-2 border-black/10 pl-3 text-sm">
                    <span className="text-black/80">{e.en}</span>
                    <span className="text-black/55"> · {e.vi}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      )}
    </BlockPage>
  )
}

function PhonemeCard({ phoneme: p, lang }: { phoneme: Phoneme; lang: Language['code'] }) {
  return (
    <article
      id={p.symbol}
      className="rounded-2xl border border-black/10 px-5 py-4"
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="ipa text-2xl font-semibold">/{p.symbol}/</span>
        {p.gaSymbol && <span className="ipa text-sm text-black/55">Mỹ: /{p.gaSymbol}/</span>}
        <span className="text-sm uppercase tracking-wide text-black/55">{p.keyword}</span>
        <span className="ml-auto text-sm text-black/55">{p.groupVi}</span>
      </header>

      <p className="mt-2 text-black/80">{p.howVi}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {p.examples.map((e) => (
          <span key={e.word} className="flex items-baseline gap-1.5">
            {/* The lookup rather than the entry: an example is chosen for its sound, and
                a word the dictionary happens not to hold would otherwise 404. */}
            <Link href={searchPath(lang, e.word)} className="font-medium hover:underline">{e.word}</Link>
            <span className="ipa text-sm text-black/55">{e.ipa}</span>
            {/* The letters that make the sound in this word, which is what the reader is
                matching the symbol against. */}
            <span className="rounded bg-black/5 px-1.5 text-xs text-black/55">{e.spelling}</span>
            <AudioButton text={e.word} lang={lang} />
          </span>
        ))}
      </div>

      <p className="mt-3 text-sm text-black/55">
        Viết là {p.spellings.map((s, i) => (
          <span key={s}>
            {i > 0 && ', '}
            <span className="font-medium text-black/75">{s}</span>
          </span>
        ))}
      </p>

      {p.minimalPair && (
        <p className="mt-1 text-sm text-black/55">
          Phân biệt <span className="font-medium text-black/75">{p.minimalPair.a}</span>{' '}
          <span className="ipa">{p.minimalPair.ipaA}</span> với{' '}
          <span className="font-medium text-black/75">{p.minimalPair.b}</span>{' '}
          <span className="ipa">{p.minimalPair.ipaB}</span>
        </p>
      )}

      {p.trapVi && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {p.trapVi}
        </p>
      )}
    </article>
  )
}
