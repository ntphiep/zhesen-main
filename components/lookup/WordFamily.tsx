import Link from 'next/link'
import { searchPath } from '@/lib/dictionary/entryId'
import { PosTag } from '@/components/ui/PosTag'
import { Ipa } from '@/components/ui/Ipa'
import type { FamilyForm } from '@/lib/dictionary/family'
import type { TermPreview } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

/**
 * "Từ liên quan": the forms of the headword itself. The label comes from
 * `lex.inflections.form_label`, the pronunciation and meaning from `lex.term_previews`.
 */
export function WordFamily({ headword, forms, previews, lang }: {
  headword: string
  forms: FamilyForm[]
  previews: Record<string, TermPreview>
  lang: LangCode
}) {
  const others = forms.filter((f) => f.text.toLowerCase() !== headword.toLowerCase())
  if (others.length === 0) return null

  // Most inflected forms have no row in `lex.entries`, only in `lex.inflections`, so
  // each column appears only when some row fills it; a column of dashes reads as broken.
  const rows = others.map((f) => {
    const p = previews[f.text.toLowerCase()]
    return {
      form: f,
      pos: p?.pos ?? null,
      sound: (lang === 'zh' ? p?.reading : p?.ipa) ?? null,
      gloss: p?.glossVi || p?.glossEn || null,
    }
  })
  const hasPos = rows.some((r) => r.pos)
  const hasSound = rows.some((r) => r.sound)
  const hasGloss = rows.some((r) => r.gloss)

  // With none of the three filled, the table is a grid for one word per row: on "holy"
  // the label cell was 405px wide for eleven characters. A running line does the same.
  if (!hasPos && !hasSound && !hasGloss) {
    return (
      <section className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="font-medium text-black/55">Dạng khác:</span>
        {rows.map(({ form }, i) => (
          <span key={form.text} className="text-black/70">
            <Link href={searchPath(lang, form.text)} className="font-medium hover:underline">
              {form.text}
            </Link>
            <span className="ml-1 text-xs text-black/50">
              {form.label}
              {form.markers.length > 0 && ` (${form.markers.join(', ')})`}
            </span>
            {i < rows.length - 1 && <span className="ml-1 text-black/25">·</span>}
          </span>
        ))}
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Các dạng của từ</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-wide text-black/55">
              <th className="px-2 py-1.5 text-left">Dạng</th>
              <th className="px-2 py-1.5 text-left">Từ</th>
              {hasPos && <th className="px-2 py-1.5 text-left">Từ loại</th>}
              {hasSound && <th className="px-2 py-1.5 text-left">Phát âm</th>}
              {hasGloss && <th className="px-2 py-1.5 text-left">Nghĩa</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ form, pos, sound, gloss }) => (
              <tr key={form.text} className="border-t border-black/5 align-baseline">
                <td className="px-2 py-1.5 text-black/50">
                  {form.label}
                  {form.markers.length > 0 && (
                    <span className="ml-1 text-xs text-black/55">{`(${form.markers.join(', ')})`}</span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <Link href={searchPath(lang, form.text)} className="font-medium hover:underline">
                    {form.text}
                  </Link>
                </td>
                {hasPos && <td className="px-2 py-1.5 whitespace-nowrap text-xs text-black/55"><PosTag value={pos} /></td>}
                {hasSound && <td className="px-2 py-1.5 text-black/60"><Ipa value={sound} lang={lang} /></td>}
                {hasGloss && <td className="px-2 py-1.5 text-black/60">{gloss ?? ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
