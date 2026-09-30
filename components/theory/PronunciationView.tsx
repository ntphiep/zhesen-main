import Link from 'next/link'
import { AudioButton } from '@/components/ui/AudioButton'
import { searchPath } from '@/lib/dictionary/entryId'
import { BlockPage } from './BlockPage'
import { Warn } from './Glyphs'
import s from './Theory.module.css'
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
          clipped 23 of the 46 chips into a box that needed its own scroll. Each kind has
          its own ground, so the vowels read apart from the consonants. */}
      <nav id="index" aria-label="Danh sách âm" className={s.index} data-reveal="">
        {phonemes.map((p) => (
          <a key={p.symbol} href={`#${encodeURIComponent(p.symbol)}`} data-k={p.kind} className="ipa">
            {p.symbol}
          </a>
        ))}
      </nav>

      {KIND_ORDER.map((kind) => {
        const ofKind = phonemes.filter((p) => p.kind === kind)
        if (ofKind.length === 0) return null
        return (
          <section key={kind} className={s.sec}>
            <h2 className={s.h2}>{KIND_TITLE[kind]}<small>{ofKind.length} âm</small></h2>
            <div className={s.grid} data-wide="">
              {ofKind.map((p) => <PhonemeCard key={p.symbol} phoneme={p} lang={language.code} />)}
            </div>
            {/* The page runs to about 21,800px on a phone and the index is not sticky, so
                each group ends with the way back to it. */}
            <a href="#index" className={s.back}>↑ Bảng ký hiệu</a>
          </section>
        )
      })}

      {notes.length > 0 && (
        <section className={s.sec}>
          <h2 className={s.h2}>Ngoài từng âm</h2>
          <div className={s.grid} data-wide="">
            {notes.map((n) => (
              <article key={n.id} id={n.id} className={`${s.card} flex flex-col gap-3`}>
                <h3 className={s.h3}>{n.titleVi}</h3>
                <p className={s.small} data-pre="">{n.bodyVi}</p>
                <ul className={s.examples} data-dense="">
                  {n.examples.map((e) => (
                    <li key={e.en} className={s.example}>
                      <p className={s.src} lang={language.code}>{e.en}</p>
                      <p className={s.vi}>{e.vi}</p>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}
    </BlockPage>
  )
}

function PhonemeCard({ phoneme: p, lang }: { phoneme: Phoneme; lang: Language['code'] }) {
  return (
    <article id={p.symbol} className={`${s.card} flex flex-col gap-3`} data-accent="">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`ipa ${s.sym}`}>/{p.symbol}/</span>
        {p.gaSymbol && <span className={`ipa ${s.note}`}>Mỹ: /{p.gaSymbol}/</span>}
        <span className={s.keyword}>{p.keyword}</span>
        <span className={`${s.tag} ml-auto`}>{p.groupVi}</span>
      </header>

      <p className={s.small}>{p.howVi}</p>

      <div className={s.words}>
        {p.examples.map((e) => (
          <span key={e.word} className={s.word}>
            {/* The lookup rather than the entry: an example is chosen for its sound, and
                a word the dictionary happens not to hold would otherwise 404. */}
            <Link href={searchPath(lang, e.word)} className={s.hw} lang={lang}>{e.word}</Link>
            <span className="ipa">{e.ipa}</span>
            {/* The letters that make the sound in this word, which is what the reader is
                matching the symbol against. */}
            <span className={s.spell}>{e.spelling}</span>
            <AudioButton text={e.word} lang={lang} />
          </span>
        ))}
      </div>

      <p className={s.note}>
        Viết là {p.spellings.map((sp, i) => (
          <span key={sp}>
            {i > 0 && ', '}
            <b className={s.hw} lang={lang}>{sp}</b>
          </span>
        ))}
      </p>

      {p.minimalPair && (
        <p className={s.note}>
          Phân biệt <b className={s.hw} lang={lang}>{p.minimalPair.a}</b>{' '}
          <span className="ipa">{p.minimalPair.ipaA}</span> với{' '}
          <b className={s.hw} lang={lang}>{p.minimalPair.b}</b>{' '}
          <span className="ipa">{p.minimalPair.ipaB}</span>
        </p>
      )}

      {p.trapVi && <p className={s.trap}><Warn />{p.trapVi}</p>}
    </article>
  )
}
