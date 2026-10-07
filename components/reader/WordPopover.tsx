import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Ipa } from '@/components/ui/Ipa'
import { PosTag } from '@/components/ui/PosTag'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import type { DictEntryPreview, CharInfo } from '@/lib/dictionary/types'
import type { SaveContext } from '@/lib/wordlist/types'
import r from './Reader.module.css'

// Loaded with the popover rather than the page: it reaches supabase-js and zod, and it
// renders nothing until the account is known, which is itself an asynchronous read.
const AddToWordlistButton = dynamic(() =>
  import('@/components/lookup/AddToWordlistButton').then((m) => m.AddToWordlistButton),
)

// Only inline-capable elements (span / a / button) so the popover is valid HTML
// even when embedded inside a paragraph of example text.
const CARD = `${r.pop} block w-72 max-w-[calc(100vw-2rem)] rounded-[14px] border border-(--edge) bg-(--zs-bg) p-4 text-left font-ui `
  + 'text-sm font-normal not-italic tracking-normal text-(--zs-ink) leading-normal'

export function WordPopover({ entry, charInfo, context, tags }: {
  entry?: DictEntryPreview
  charInfo?: CharInfo
  context?: SaveContext | null
  tags?: readonly string[]
}) {
  if (entry) {
    return (
      <span className={CARD}>
        <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span data-hw="" lang={entry.lang} className="text-[22px] leading-tight">{entry.headword}</span>
          <Ipa value={entry.ipa} lang={entry.lang} className="text-[13px] text-(--zs-soft)" />
        </span>
        <PosTag full value={entry.pos} className="mt-1.5 block w-fit rounded-full bg-(--zs-chip) px-[7px] py-0.5 text-[11px] text-(--zs-soft)" />
        {entry.glossVi && <span className="mt-2 block text-[15px] font-semibold leading-snug">{entry.glossVi}</span>}
        <span className="mt-3.5 flex items-center justify-between gap-3 border-t border-(--zs-line) pt-3">
          <Link href={entryPath(entry.id)} className="shrink-0 text-[13px] font-semibold text-(--zs-pen) hover:underline">
            Xem chi tiết
            <LinkPending />
          </Link>
          <AddToWordlistButton entry={entry} context={context} tags={tags} />
        </span>
      </span>
    )
  }
  if (charInfo) {
    return (
      <span className={CARD}>
        <span className="flex items-center gap-3.5">
          <span data-hw="" lang="zh" className="grid size-14 shrink-0 place-items-center rounded-xl bg-(--tint-2) text-[34px] leading-none">
            {charInfo.char}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5 text-sm">
            <span className="flex flex-wrap gap-x-2">
              {charInfo.pinyin.length > 0 && <span className="font-semibold text-(--zs-pen)">{charInfo.pinyin.join(', ')}</span>}
              {charInfo.hanViet.length > 0 && <span className="italic">{charInfo.hanViet.join(', ')}</span>}
            </span>
            <span className="flex gap-2 text-xs text-(--zs-soft)">
              {charInfo.radical && <span>Bộ: {charInfo.radical}</span>}
              {charInfo.strokeCount != null && <span>{charInfo.strokeCount} nét</span>}
            </span>
            {charInfo.gloss && <span className="text-[13px]">{charInfo.gloss}</span>}
          </span>
        </span>
      </span>
    )
  }
  return null
}
