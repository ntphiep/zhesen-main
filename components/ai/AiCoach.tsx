'use client'
import { useState, type ReactNode } from 'react'
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
 * `children` are other actions drawn in the same row, before the button, and they stay
 * when the assistant is off.
 */
export function AiCoach({ lang, headword, meaningVi, children }: {
  lang: LangCode
  headword: string
  meaningVi: string | null
  children?: ReactNode
}) {
  const enabled = useAiEnabled()
  const [state, setState] = useState<State>({ status: 'idle' })

  if (!enabled) return children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null

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
      setState({ status: 'error', message: 'Chưa hỏi được AI.' })
    }
  }

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      {(state.status === 'idle' || state.status === 'error') && (
        <button
          type="button"
          onClick={ask}
          // The chat launcher on every page is also "Hỏi AI"; the name keeps the two apart.
          aria-label={state.status === 'error' ? undefined : `Hỏi AI về ${headword}`}
          className="rounded-lg border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/5"
        >
          {state.status === 'error' ? 'Thử lại' : 'Hỏi AI'}
        </button>
      )}
      {state.status === 'error' && <span className="text-xs text-red-500">{state.message}</span>}
      {state.status === 'loading' && <span className="text-xs text-black/55">AI đang trả lời…</span>}
    </div>
  )

  if (state.status !== 'ok') return actions

  const { mnemonic, collocations, examples, confusables } = state.data
  return (
    <div className="flex flex-col gap-3">
      {children && actions}
      <div className="flex flex-col gap-3 rounded-lg bg-black/3 p-3 text-sm">
        {mnemonic && (
          <div>
            <h4 className="text-xs font-semibold uppercase text-black/55">Mẹo nhớ</h4>
            <p className="mt-0.5 text-black/80">{mnemonic}</p>
          </div>
        )}

        {collocations.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase text-black/55">Cụm hay đi kèm</h4>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {collocations.map((c) => (
                <li key={c} className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/70">{c}</li>
              ))}
            </ul>
          </div>
        )}

        {examples.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase text-black/55">Ví dụ</h4>
            <ul className="mt-1 flex flex-col gap-1.5 border-l-2 border-black/10 pl-3">
              {examples.map((e) => (
                <li key={e.text}>
                  <p className="italic text-black/75">{e.text}</p>
                  <p className="text-black/55">{e.vi}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {confusables.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase text-black/55">Dễ nhầm với</h4>
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
          <p className="text-xs text-black/55">AI không có gì thêm cho từ này.</p>
        )}
      </div>
    </div>
  )
}
