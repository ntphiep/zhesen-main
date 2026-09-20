import Link from 'next/link'
import { Ipa } from '@/components/ui/Ipa'
import { PosTag } from '@/components/ui/PosTag'
import { AddToWordlistButton } from '@/components/lookup/AddToWordlistButton'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import type { DictEntryPreview, CharInfo } from '@/lib/dictionary/types'

// Only inline-capable elements (span / a / button) so the popover is valid HTML
// even when embedded inside a paragraph of example text.
const CARD = 'block w-64 rounded-xl border border-black/10 bg-white p-3 text-left shadow-lg'

export function WordPopover({ entry, charInfo }: { entry?: DictEntryPreview; charInfo?: CharInfo }) {
  if (entry) {
    return (
      <span className={CARD}>
        <span className="flex items-baseline gap-2">
          <span className="text-lg font-semibold">{entry.headword}</span>
          <Ipa value={entry.ipa} lang={entry.lang} className="text-xs text-black/40" />
          <PosTag value={entry.pos} className="text-xs text-black/40" />
        </span>
        {entry.glossVi && <span className="mt-1 block text-sm text-black/70">{entry.glossVi}</span>}
        <span className="mt-2 flex items-center gap-3">
          <Link href={entryPath(entry.id)} className="text-sm text-blue-700 hover:underline">
            Xem chi tiết
            <LinkPending />
          </Link>
          <AddToWordlistButton entry={entry} />
        </span>
      </span>
    )
  }
  if (charInfo) {
    return (
      <span className={CARD}>
        <span className="flex items-center gap-3">
          <span className="text-2xl font-bold">{charInfo.char}</span>
          <span className="flex flex-col gap-0.5 text-sm">
            <span className="flex gap-2 text-black/70">
              {charInfo.pinyin.length > 0 && <span className="font-medium">{charInfo.pinyin.join(', ')}</span>}
              {charInfo.hanViet.length > 0 && <span className="italic">{charInfo.hanViet.join(', ')}</span>}
            </span>
            <span className="flex gap-2 text-xs text-black/50">
              {charInfo.radical && <span>Bộ: {charInfo.radical}</span>}
              {charInfo.strokeCount != null && <span>{charInfo.strokeCount} nét</span>}
            </span>
            {charInfo.gloss && <span className="text-xs text-black/50">{charInfo.gloss}</span>}
          </span>
        </span>
      </span>
    )
  }
  return null
}
