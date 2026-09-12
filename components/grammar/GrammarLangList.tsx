import Link from 'next/link'
import { grammarLangPath } from '@/lib/grammar/path'
import type { Language, LangCode } from '@/lib/languages'

/** `/grammar` landing page: one card per language, linking into `/grammar/[lang]`. */
export function GrammarLangList({ languages, counts }: { languages: readonly Language[]; counts: Record<LangCode, number> }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-black/50 hover:underline">← Trang chủ</Link>
      <h1 className="mt-3 text-3xl font-bold">Ngữ pháp</h1>
      <p className="mt-1 text-sm text-black/60">Các điểm ngữ pháp theo cấp độ, có ví dụ và lỗi hay mắc.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {languages.map((l) => (
          <Link
            key={l.code}
            href={grammarLangPath(l.code)}
            className="group rounded-2xl border border-black/10 p-5 transition hover:border-black/30 hover:shadow-lg hover:-translate-y-0.5"
          >
            <div className="text-lg font-medium text-black/70">{l.nativeName}</div>
            <div className="mt-2 text-lg font-semibold">{l.name}</div>
            <div className="mt-1 text-sm text-black/55">{counts[l.code]} điểm ngữ pháp</div>
          </Link>
        ))}
      </div>
    </main>
  )
}
