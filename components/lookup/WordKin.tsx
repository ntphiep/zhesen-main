import Link from 'next/link'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import { posGroup } from '@/lib/dictionary/pos'
import type { DictEntryPreview } from '@/lib/dictionary/types'

/**
 * "Từ cùng gốc", grouped by part of speech: the words derived from the same stem and
 * the word class each belongs to, neither of which an inflected entry's page carries
 * on its own.
 */
export function WordKin({ words }: { words: DictEntryPreview[] }) {
  if (words.length === 0) return null

  const groups = new Map<string, { label: string; words: DictEntryPreview[] }>()
  for (const w of words) {
    const g = posGroup(w.pos)
    const key = g?.key ?? ''
    const bucket = groups.get(key) ?? { label: g?.labelVi ?? 'Khác', words: [] }
    bucket.words.push(w)
    groups.set(key, bucket)
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-lg font-semibold">Từ cùng gốc</h2>
        <span className="text-xs text-black/35">Cùng một gốc từ, khác từ loại hoặc khác dạng</span>
      </div>
      {[...groups.values()].map((g) => (
        <div key={g.label} className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/55">{g.label}</span>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {g.words.map((w) => (
                  <tr key={w.id} className="border-t border-black/5 align-baseline">
                    <td className="px-2 py-1.5">
                      <Link href={entryPath(w.id)} className="font-medium hover:underline">{w.headword}<LinkPending /></Link>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-xs text-black/55">{w.level ?? ''}</td>
                    <td className="px-2 py-1.5 text-black/60">{w.glossVi || w.glossEn || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  )
}
