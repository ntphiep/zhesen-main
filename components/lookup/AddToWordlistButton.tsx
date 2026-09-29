'use client'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import { signInHref, useAccount } from '@/lib/hooks/useAccount'
import type { DictEntryDetail, DictEntryPreview } from '@/lib/dictionary/types'

// Loaded once an account is known: it reaches supabase-js and zod, which the word page
// otherwise never needs before it is interactive.
const SavedButton = dynamic(() => import('./SavedButton').then((m) => m.SavedButton))

/**
 * Save one dictionary entry to the notebook. The notebook belongs to an account, so
 * without one this is an invitation to sign in, pointing back at the page the visitor
 * came from, since signing in must not cost them where they were reading.
 *
 * `lg` is the word page's primary action: 44px tall, the height of a touch target.
 * `tone="pane"` draws it in the colours of the landing page's language lanes.
 */
export function AddToWordlistButton({ entry, size = 'sm', tone }: { entry: DictEntryPreview | DictEntryDetail; size?: 'sm' | 'lg'; tone?: 'pane' }) {
  const { kind } = useAccount()

  if (kind === null) return null
  if (kind !== 'permanent') {
    return (
      <Link
        href={`${signInHref(kind)}?next=${encodeURIComponent(entryPath(entry.id))}`}
        prefetch={false}
        className={tone === 'pane'
          ? 'inline-flex h-10 items-center rounded-full border-[1.5px] border-current px-4 text-sm font-bold hover:bg-current/10'
          : size === 'lg'
          ? 'inline-flex h-11 items-center rounded-full border-[1.5px] border-(--zs-ink) bg-(--zs-bg) px-5 text-sm font-bold text-(--zs-ink) transition-colors duration-150 ease-std hover:bg-(--zs-ink) hover:text-(--zs-bg)'
          : 'rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium text-black/70 hover:bg-black/5'}
      >
        Đăng nhập để lưu
        <LinkPending />
      </Link>
    )
  }
  return <SavedButton entry={entry} size={size} tone={tone} />
}
