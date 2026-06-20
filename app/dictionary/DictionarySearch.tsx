'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { searchEntries } from '@/lib/dictionary/search'
import { entryPath } from '@/lib/dictionary/entryId'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/content/types'

const LANGS: LangCode[] = ['en', 'zh', 'es']

export function DictionarySearch({ initialQuery, initialLang }: { initialQuery: string; initialLang: LangCode }) {
  const supabase = useMemo(() => createClient(), [])
  const [lang, setLang] = useState<LangCode>(initialLang)
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<DictEntryPreview[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query.trim()) { setResults([]); setLoading(false); return }
    setLoading(true)
    const id = setTimeout(async () => {
      try {
        setResults(await searchEntries(supabase, lang, query))
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(id)
  }, [query, lang, supabase])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as LangCode)}
          className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm"
        >
          {LANGS.map((l) => <option key={l} value={l}>{LANG_LABELS[l]}</option>)}
        </select>
        <input
          type="text"
          autoFocus
          placeholder="Nhập từ cần tra..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-lg border border-black/15 px-4 py-2"
        />
      </div>
      {loading && <p className="text-sm text-black/40">Đang tìm...</p>}
      {!loading && query.trim() && results.length === 0 && (
        <p className="text-sm text-black/40">Không tìm thấy kết quả.</p>
      )}
      <ul className="flex flex-col gap-1">
        {results.map((e) => (
          <li key={e.id}>
            <Link href={entryPath(e.id)} className="flex items-baseline gap-2 rounded-lg px-3 py-2 hover:bg-black/5">
              <span className="font-medium">{e.headword}</span>
              {e.ipa && <span className="font-mono text-xs text-black/40">{e.ipa}</span>}
              {e.glossVi && <span className="text-sm text-black/60">{e.glossVi}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
