import Link from 'next/link'
import { Ipa } from '@/components/ui/Ipa'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import type { DailyWord } from '@/lib/dictionary/wordOfDay'

export function WordOfDayCard({ word }: { word: DailyWord | null }) {
  if (!word) return null
  return (
    <Link
      href={entryPath(word.id)}
      className="group flex items-center justify-between gap-4 rounded-2xl border border-black/10 bg-black/[0.02] px-6 py-4 transition hover:border-black/30"
    >
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-black/40">Từ vựng hôm nay</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{word.headword}</span>
          <Ipa value={word.ipa} lang={word.lang} className="text-sm text-black/40" />
          {word.level && <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/50">{word.level}</span>}
        </div>
        {word.glossVi && <div className="mt-0.5 text-sm text-black/60">{word.glossVi}</div>}
      </div>
      <span className="text-sm font-medium text-black/40 transition group-hover:text-black/70">Xem →</span>
      <LinkPending />
    </Link>
  )
}
