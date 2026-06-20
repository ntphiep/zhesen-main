'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getEntryDetail } from '@/lib/dictionary/search'
import { AudioButton } from '@/components/AudioButton'
import type { DictEntryDetail } from '@/lib/dictionary/types'
import type { UserWord } from '@/lib/wordlist/types'

export function WordDetail({ word }: { word: UserWord }) {
  const supabase = useMemo(() => createClient(), [])
  const [detail, setDetail] = useState<DictEntryDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!word.entryId) return
    setLoading(true)
    setError(null)
    getEntryDetail(supabase, word.entryId)
      .then((d) => setDetail(d))
      .catch(() => setError('Không tải được chi tiết.'))
      .finally(() => setLoading(false))
  }, [supabase, word.entryId])

  if (!word.entryId) {
    return (
      <div className="flex flex-col gap-2 text-sm text-black/80">
        {word.meaningVi && <p>{word.meaningVi}</p>}
        {word.example && <p className="italic text-black/60">{word.example}</p>}
        {word.notes && <p className="text-black/50">{word.notes}</p>}
      </div>
    )
  }

  if (loading) {
    return <p className="text-sm text-black/40">Đang tải...</p>
  }

  if (error) {
    return <p className="text-sm text-red-500">{error}</p>
  }

  if (!detail) return null

  // Group relations by relationType
  const relationGroups = detail.relations.reduce<Record<string, string[]>>((acc, r) => {
    if (!r.relatedText) return acc
    const key = r.relationType
    if (!acc[key]) acc[key] = []
    acc[key].push(r.relatedText)
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-3 text-sm">
      {/* Senses */}
      {detail.senses.length > 0 && (
        <div className="flex flex-col gap-1">
          {detail.senses.map((s, i) => (
            <div key={i} className="flex gap-2 items-baseline">
              {s.pos && <span className="text-xs font-medium text-black/40 uppercase">{s.pos}</span>}
              {s.glossVi && <span className="text-black/80">{s.glossVi}</span>}
              {s.glossEn && <span className="text-black/50">{s.glossEn}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Pronunciations */}
      {detail.pronunciations.length > 0 && (
        <div className="flex flex-col gap-1">
          {detail.pronunciations.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-black/40">{p.accent}</span>
              {p.ipa && <span className="ipa text-black/70">{p.ipa}</span>}
              <AudioButton text={detail.headword} lang={detail.lang} audioUrl={p.audioUrl} />
            </div>
          ))}
        </div>
      )}

      {/* Examples */}
      {detail.examples.length > 0 && (
        <div className="flex flex-col gap-1 border-l-2 border-black/10 pl-3">
          {detail.examples.map((e, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <p className="italic text-black/70">{e.text}</p>
              {e.translationVi && <p className="text-black/50">{e.translationVi}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Relations */}
      {Object.keys(relationGroups).length > 0 && (
        <div className="flex flex-col gap-1">
          {Object.entries(relationGroups).map(([type, words]) => (
            <div key={type} className="flex gap-2 items-baseline flex-wrap">
              <span className="text-xs font-medium text-black/40 uppercase">{type}</span>
              {words.map((w, i) => (
                <span key={i} className="text-black/70">{w}</span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
