import { AudioButton, SourceLink } from '@/components/ui/AudioButton'
import { pickAccentRows } from '@/lib/dictionary/pronunciation'
import { IpaLinked } from '@/components/theory/IpaLinked'
import type { DictPron } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

/**
 * Cambridge-style pronunciation block: a UK and a US row for English (each with
 * its own IPA and audio), a single row otherwise. Each row's audio button plays
 * the accent's recording when present, else falls back to TTS in that accent.
 * Every symbol links to its own sound on the pronunciation page. A Commons recording
 * links to its file page, which carries the attribution its licence requires.
 *
 * `pill` draws each row as a rounded chip with the sound first, as the word page does.
 */
export function Pronunciation({ headword, prons, lang, pill = false }: {
  headword: string
  prons: DictPron[]
  lang: LangCode
  pill?: boolean
}) {
  const rows = pickAccentRows(prons, lang, headword)
  if (pill) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {rows.map((r, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-black/10 bg-white pl-0.5 pr-3.5 text-sm">
              <AudioButton text={headword} lang={lang} audioUrl={r.audioUrl} accent={r.ttsLang} />
              {r.label && <span className="text-black/60">{r.label}</span>}
              <IpaLinked value={r.ipa} lang={lang} className="text-black/85" />
            </span>
            <SourceLink url={r.audioUrl} />
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {rows.map((r, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 text-black/70">
          {r.label && <span className="text-xs font-semibold uppercase tracking-wide text-black/60">{r.label}</span>}
          <IpaLinked value={r.ipa} lang={lang} className="text-[0.95rem] text-black/60" />
          <AudioButton text={headword} lang={lang} audioUrl={r.audioUrl} accent={r.ttsLang} />
          <SourceLink url={r.audioUrl} />
        </span>
      ))}
    </div>
  )
}
