import { AudioButton } from '@/components/ui/AudioButton'
import { BlockPage } from './BlockPage'
import type { Phoneme, PhonemeKind, PronunciationNote } from '@/lib/theory/types'
import type { Language } from '@/lib/languages'

const KIND_TITLE: Record<PhonemeKind, string> = {
  vowel: 'Nguyên âm',
  diphthong: 'Nguyên âm đôi',
  consonant: 'Phụ âm',
}

const KIND_ORDER: PhonemeKind[] = ['vowel', 'diphthong', 'consonant']

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
      titleVi="Phát âm"
      leadVi={`${phonemes.length} âm, mỗi âm có ví dụ, những cách viết tạo ra nó và chỗ người Việt hay đọc chệch.`}
    >
      <nav aria-label="Danh sách âm" className="mt-6 flex flex-wrap gap-1">
        {phonemes.map((p) => (
          <a
            key={p.symbol}
            href={`#${encodeURIComponent(p.symbol)}`}
            className="ipa rounded-lg border border-black/10 px-2.5 py-1 text-sm hover:bg-black/5"
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
              {KIND_TITLE[kind]} <span className="text-base font-normal text-black/40">{ofKind.length} âm</span>
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              {ofKind.map((p) => <PhonemeCard key={p.symbol} phoneme={p} lang={language.code} />)}
            </div>
          </section>
        )
      })}

      {notes.length > 0 && (
        <section className="mt-12 flex flex-col gap-6">
          <h2 className="text-xl font-semibold">Ngoài từng âm</h2>
          {notes.map((n) => (
            <article key={n.id} id={n.id} className="scroll-mt-20">
              <h3 className="font-semibold">{n.titleVi}</h3>
              <p className="mt-1 whitespace-pre-line text-black/80">{n.bodyVi}</p>
              <ul className="mt-2 flex flex-col gap-1">
                {n.examples.map((e) => (
                  <li key={e.en} className="border-l-2 border-black/10 pl-3 text-sm">
                    <span className="text-black/80">{e.en}</span>
                    <span className="text-black/45"> · {e.vi}</span>
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
      // The header is sticky, so an anchor jump otherwise lands with the title under it.
      className="scroll-mt-20 rounded-2xl border border-black/10 px-5 py-4"
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="ipa text-2xl font-semibold">/{p.symbol}/</span>
        {p.gaSymbol && <span className="ipa text-sm text-black/45">Mỹ: /{p.gaSymbol}/</span>}
        <span className="text-sm uppercase tracking-wide text-black/40">{p.keyword}</span>
        <span className="ml-auto text-sm text-black/45">{p.groupVi}</span>
      </header>

      <p className="mt-2 text-black/80">{p.howVi}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {p.examples.map((e) => (
          <span key={e.word} className="flex items-baseline gap-1.5">
            <span className="font-medium">{e.word}</span>
            <span className="ipa text-sm text-black/45">{e.ipa}</span>
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
