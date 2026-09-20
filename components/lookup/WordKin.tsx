import Link from 'next/link'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import { posGroups, splitPos } from '@/lib/dictionary/pos'
import type { DictEntryPreview } from '@/lib/dictionary/types'

/**
 * "Từ cùng gốc", grouped by part of speech: the words derived from the same stem and
 * the word class each belongs to, neither of which an inflected entry's page carries
 * on its own.
 */
export function WordKin({ words }: { words: DictEntryPreview[] }) {
  if (words.length === 0) return null

  // Grouped by the word's main part of speech, not by the whole stored list: a word
  // that is both a noun and a verb belongs under the noun, not in a group of its own.
  const groups = new Map<string, { label: string; title: string; words: DictEntryPreview[] }>()
  for (const w of words) {
    const g = posGroups(splitPos(w.pos))[0]
    const key = g?.key ?? ''
    const bucket = groups.get(key) ?? { label: g?.abbr ?? 'Khác', title: g?.labelVi ?? 'Không rõ từ loại', words: [] }
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
          <abbr title={g.title} className="text-xs font-semibold tracking-wide text-black/55 no-underline">{g.label}</abbr>
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
