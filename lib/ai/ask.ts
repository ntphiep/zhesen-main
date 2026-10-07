/** Opens the assistant in the root layout (`AiChatPanel`) on one item a page shows: `seed`
 *  goes ahead of every question as the learner's first turn, `draft` fills the box. */
export interface AskAi {
  /** What the panel says it is asking about, as "câu 147". */
  label: string
  seed: string
  draft: string
}

const ASK_AI_EVENT = 'zhesen:ask-ai'

export function askAi(detail: AskAi): void {
  window.dispatchEvent(new CustomEvent(ASK_AI_EVENT, { detail }))
}

function isAskAi(v: unknown): v is AskAi {
  return typeof v === 'object' && v !== null
    && 'label' in v && typeof v.label === 'string'
    && 'seed' in v && typeof v.seed === 'string'
    && 'draft' in v && typeof v.draft === 'string'
}

export function onAskAi(listen: (detail: AskAi) => void): () => void {
  const handle = (e: Event) => { if (e instanceof CustomEvent && isAskAi(e.detail)) listen(e.detail) }
  window.addEventListener(ASK_AI_EVENT, handle)
  return () => window.removeEventListener(ASK_AI_EVENT, handle)
}
