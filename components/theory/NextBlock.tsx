import Link from 'next/link'
import { BLOCKS_BY_LANG, type TheoryBlockKey } from '@/lib/theory/blocks'
import { theoryBlockPath } from '@/lib/theory/path'
import type { LangCode } from '@/lib/languages'

/** The blocks are in learning order, so the end of one is the start of the next. The
 *  last block has nowhere to go and renders nothing. */
export function NextBlock({ lang, block }: { lang: LangCode; block: TheoryBlockKey }) {
  const blocks = BLOCKS_BY_LANG[lang]
  const here = blocks.findIndex((b) => b.key === block)
  const next = here === -1 ? undefined : blocks[here + 1]
  if (!next) return null
  return (
    <Link
      href={theoryBlockPath(lang, next.key)}
      className="mt-14 flex items-baseline justify-between rounded-2xl border border-black/10 px-5 py-4 transition hover:border-black/30 hover:bg-black/5"
    >
      <span className="text-sm text-black/55">Tiếp theo</span>
      <span className="font-semibold">{next.titleVi} →</span>
    </Link>
  )
}
