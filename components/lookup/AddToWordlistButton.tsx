'use client'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import { useAccount } from '@/lib/hooks/useAccount'
import { rememberPendingSave } from '@/lib/wordlist/pendingSave'
import type { DictEntryDetail, DictEntryPreview } from '@/lib/dictionary/types'
import type { SaveContext } from '@/lib/wordlist/types'

// Loaded once an account is known: it reaches supabase-js and zod, which the word page
// otherwise never needs before it is interactive.
const SavedButton = dynamic(() => import('./SavedButton').then((m) => m.SavedButton))

/**
 * Save one dictionary entry to the notebook. The notebook belongs to an account, so
 * without one the same label leads to /register and back to this page, where
 * `SavedButton` finishes the save the visitor asked for.
 *
 * `lg` is the word page's primary action: 44px tall, the height of a touch target.
 * `tone="pane"` draws it in the colours of the landing page's language lanes.
 */
export function AddToWordlistButton({ entry, size = 'sm', tone, context }: {
  entry: DictEntryPreview | DictEntryDetail
  size?: 'sm' | 'lg'
  tone?: 'pane'
  context?: SaveContext | null
}) {
  const { kind } = useAccount()

  if (kind === null) return null
  if (kind !== 'permanent') {
    return (
      <Link
        href={`/register?next=${encodeURIComponent(entryPath(entry.id))}`}
        prefetch={false}
        onClick={() => rememberPendingSave(entry.id)}
        className={tone === 'pane'
          ? 'inline-flex h-10 items-center rounded-full border-[1.5px] border-current px-4 text-sm font-bold hover:bg-current/10'
          : `inline-flex items-center whitespace-nowrap rounded-full border-[1.5px] border-(--zs-ink) bg-(--zs-bg) font-bold text-(--zs-ink) transition-colors duration-150 ease-std hover:bg-(--zs-ink) hover:text-(--zs-bg) ${
            size === 'lg' ? 'h-11 px-5 text-sm' : 'h-9 px-4 text-[13px]'
          }`}
      >
        Thêm vào sổ tay
        <LinkPending />
      </Link>
    )
  }
  return <SavedButton entry={entry} size={size} tone={tone} context={context} />
}
