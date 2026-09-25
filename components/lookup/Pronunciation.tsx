import { AudioButton } from '@/components/ui/AudioButton'
import { pickAccentRows } from '@/lib/dictionary/pronunciation'
import { IpaLinked } from '@/components/theory/IpaLinked'
import type { DictPron } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

/**
 * Cambridge-style pronunciation block: a UK and a US row for English (each with
 * its own IPA and audio), a single row otherwise. Each row's audio button plays
 * the accent's recording when present, else falls back to TTS in that accent.
 * Every symbol links to its own sound on the pronunciation page.
 */
export function Pronunciation({ headword, prons, lang }: { headword: string; prons: DictPron[]; lang: LangCode }) {
  const rows = pickAccentRows(prons, lang, headword)
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {rows.map((r, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 text-black/70">
          {r.label && <span className="text-xs font-semibold uppercase tracking-wide text-black/40">{r.label}</span>}
          <IpaLinked value={r.ipa} lang={lang} className="text-[0.95rem] text-black/60" />
          <AudioButton text={headword} lang={lang} audioUrl={r.audioUrl} accent={r.ttsLang} />
        </span>
      ))}
    </div>
  )
}
