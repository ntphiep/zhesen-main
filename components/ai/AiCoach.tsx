'use client'
import { useState } from 'react'
import { callAi } from '@/lib/ai/browser'
import { useAiEnabled } from '@/lib/hooks/useAiEnabled'
import type { CoachOutput } from '@/lib/ai/tasks'
import type { LangCode } from '@/lib/languages'

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: CoachOutput }
  | { status: 'error'; message: string }

/**
 * The assistant's panel for one saved word: a memory hook, the phrases the word
 * travels with, two worked examples and the words it is confused with.
 *
 * Behind a button: a model call is the most expensive thing a click here can trigger,
 * and an expanded row usually wants the dictionary entry already on screen above.
 * Nothing is cached across mounts; a learner who asks twice wants a second opinion.
 */
export function AiCoach({ lang, headword, meaningVi }: {
  lang: LangCode
  headword: string
  meaningVi: string | null
}) {
  const enabled = useAiEnabled()
  const [state, setState] = useState<State>({ status: 'idle' })

  if (!enabled) return null

  async function ask() {
    setState({ status: 'loading' })
    try {
      const outcome = await callAi('coach', { lang, headword, meaningVi })
      setState(outcome.status === 'ok'
        ? { status: 'ok', data: outcome.data }
        : { status: 'error', message: outcome.message })
    } catch {
      // `callAi` handles fetch failures, but its dynamic task-module import rejects
      // after a redeploy, which would leave this stuck on the loading state.
      setState({ status: 'error', message: 'Chưa hỏi được trợ lý.' })
    }
  }

  if (state.status === 'idle' || state.status === 'error') {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={ask}
          className="rounded-lg border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/5"
        >
          {state.status === 'error' ? 'Thử lại' : 'Hỏi trợ lý về từ này'}
        </button>
        {state.status === 'error' && <span className="text-xs text-red-500">{state.message}</span>}
      </div>
    )
  }

  if (state.status === 'loading') {
    return <p className="text-xs text-black/40">Trợ lý đang soạn…</p>
  }

  const { mnemonic, collocations, examples, confusables } = state.data
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-black/3 p-3 text-sm">
      {mnemonic && (
        <div>
          <h4 className="text-xs font-semibold uppercase text-black/40">Mẹo nhớ</h4>
          <p className="mt-0.5 text-black/80">{mnemonic}</p>
        </div>
      )}

      {collocations.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase text-black/40">Cụm hay đi kèm</h4>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {collocations.map((c) => (
              <li key={c} className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/70">{c}</li>
            ))}
          </ul>
        </div>
      )}

      {examples.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase text-black/40">Ví dụ</h4>
          <ul className="mt-1 flex flex-col gap-1.5 border-l-2 border-black/10 pl-3">
            {examples.map((e) => (
              <li key={e.text}>
                <p className="italic text-black/75">{e.text}</p>
                <p className="text-black/50">{e.vi}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {confusables.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase text-black/40">Dễ nhầm với</h4>
          <ul className="mt-1 flex flex-col gap-1">
            {confusables.map((c) => (
              <li key={c.word} className="text-black/75">
                <span className="font-medium">{c.word}</span>
                <span className="text-black/55"> — {c.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The model is asked not to guess, so an answer can legitimately be empty. */}
      {!mnemonic && collocations.length === 0 && examples.length === 0 && confusables.length === 0 && (
        <p className="text-xs text-black/40">Trợ lý không có gì thêm cho từ này.</p>
      )}
    </div>
  )
}
