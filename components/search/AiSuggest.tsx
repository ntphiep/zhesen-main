'use client'
import { useState } from 'react'
import Link from 'next/link'
import { callAi } from '@/lib/ai/browser'
import { useAiEnabled } from '@/lib/hooks/useAiEnabled'
import { searchPath } from '@/lib/dictionary/entryId'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import type { SuggestOutput } from '@/lib/ai/tasks'

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; words: SuggestOutput['words'] }
  | { kind: 'error'; message: string }

/**
 * The way out of "Không tìm thấy kết quả." for a learner who knows the meaning but
 * not the word: ask the assistant for candidate headwords, then hand each one back
 * to the dictionary, so what reaches the entry page is still sourced data.
 *
 * Behind a button, not fired on every empty search: a typo mid-typing empties the
 * search on almost every keystroke, and a model call per keystroke is slow and dear.
 */
export function AiSuggest({ query }: { query: string }) {
  const enabled = useAiEnabled()
  const [state, setState] = useState<State>({ kind: 'idle' })

  // A new query invalidates the previous answer. Reset during render, since an
  // effect would paint the stale list once before clearing it.
  const [askedFor, setAskedFor] = useState(query)
  if (query !== askedFor) {
    setAskedFor(query)
    setState({ kind: 'idle' })
  }

  // `aiConfig()` returning null is a supported state: the router is on a private
  // network, so a deployment that cannot reach it shows no button at all.
  if (!enabled) return null

  async function ask() {
    setState({ kind: 'loading' })
    try {
      const outcome = await callAi('suggest', { query })
      setState(outcome.status === 'ok'
        ? { kind: 'done', words: outcome.data.words }
        : { kind: 'error', message: outcome.message })
    } catch {
      // `callAi` handles fetch failures, but its dynamic task-module import rejects
      // after a redeploy, which would leave this stuck on the loading state.
      setState({ kind: 'error', message: 'Không hỏi được trợ lý. Vui lòng thử lại.' })
    }
  }

  if (state.kind === 'idle') {
    return (
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); ask() }}
        className="self-start rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5"
      >
        Hỏi trợ lý xem đây là từ nào
      </button>
    )
  }

  if (state.kind === 'loading') return <p className="text-sm text-black/40">Đang hỏi trợ lý…</p>
  if (state.kind === 'error') return <p className="text-sm text-red-600">{state.message}</p>

  if (state.words.length === 0) {
    return <p className="text-sm text-black/40">Trợ lý cũng không nghĩ ra từ nào.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-black/40">
        Trợ lý gợi ý, chưa qua từ điển
      </span>
      <ul className="flex flex-col gap-1">
        {state.words.map((w) => (
          <li key={`${w.lang}:${w.headword}`}>
            <Link
              href={searchPath(w.lang, w.headword)}
              className="group flex flex-wrap items-baseline gap-2 rounded-lg px-2 py-1 hover:bg-black/5"
            >
              <span className="font-medium group-hover:underline">{w.headword}</span>
              <span className="text-xs text-black/40">{LANG_LABELS[w.lang]}</span>
              <span className="text-sm text-black/60">{w.meaningVi}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
