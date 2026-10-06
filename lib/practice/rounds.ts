import type { SupabaseClient } from '@supabase/supabase-js'
import { listLearnerDistractors } from '@/lib/dictionary/learner'
import { listPracticeWords, listTraditionalForms, listWordEntries, type PracticeWord } from '@/lib/wordlist/store'
import { clozeForms, findGap } from './cloze'
import { pickFormQuestion } from './forms'
import { buildPhraseGap, gapSlot, rivalPhrases } from './phraseGap'
import { buildQuiz, type QuizQuestion } from './quiz'
import { shuffle, type Rand } from './shuffle'
import { listEntryExamples, listEntryForms, listExistingPhrases, listPracticeContext, listSavedPhrases } from './sources'
import type { TypingPrompt } from './typing'

/** The typing modes: the meaning, the sound, the IPA, a sentence or a form leads to the word. */
export type TypingMode = 'write' | 'dictation' | 'ipa' | 'cloze' | 'forms'

export const ROUND_SIZE = 10

const hasMeaning = (w: PracticeWord) => Boolean(w.meaningVi?.trim())

/** One IPA transcription between slashes, as the English and Spanish entries write it. */
const readableIpa = (ipa: string | null) => Boolean(ipa && /^\/[^/[\]]+\/$/.test(ipa.trim()))

function prompt(w: PracticeWord, extra: Partial<TypingPrompt> = {}): TypingPrompt {
  return { id: w.id, headword: w.headword, meaningVi: w.meaningVi, ipa: w.ipa, audioUrl: w.audioUrl, lang: w.lang, ...extra }
}

/** A Chinese word also takes its pinyin, which `ipa` holds, and its traditional form. */
async function withChinese(supabase: SupabaseClient, round: PracticeWord[]): Promise<TypingPrompt[]> {
  const zh = round.filter((w) => w.lang === 'zh').map((w) => w.id)
  const traditional = zh.length ? await listTraditionalForms(supabase, zh).catch(() => new Map<string, string>()) : new Map<string, string>()
  return round.map((w) => prompt(w, {
    accepted: w.lang === 'zh' ? [w.ipa, traditional.get(w.id)].filter((v): v is string => Boolean(v)) : [],
  }))
}

async function clozeRound(supabase: SupabaseClient, words: PracticeWord[], rand: Rand): Promise<TypingPrompt[]> {
  const order = shuffle(words.filter(hasMeaning), rand)
  const context = await listPracticeContext(supabase, order.map((w) => w.id))
  const entryOf = (w: PracticeWord) => context.get(w.id)?.entryId ?? null
  const forms = await listEntryForms(supabase, [...new Set(order.map(entryOf).filter((e): e is string => Boolean(e)))])
    .catch(() => new Map<string, { text: string }[]>())
  const formsOf = (w: PracticeWord) => clozeForms(w.headword, w.lang, (forms.get(entryOf(w) ?? '') ?? []).map((f) => f.text))
  const toPrompt = (w: PracticeWord, gap: NonNullable<ReturnType<typeof findGap>>) => prompt(w, {
    gap,
    answer: gap.answer,
    accepted: w.lang === 'zh' && gap.answer === w.headword && w.ipa ? [w.ipa] : [],
  })

  const out: TypingPrompt[] = []
  const rest: PracticeWord[] = []
  for (const w of order) {
    if (out.length >= ROUND_SIZE) break
    const own = context.get(w.id)?.example
    const gap = own ? findGap([own], formsOf(w), w.lang) : null
    if (gap) out.push(toPrompt(w, gap))
    else if (entryOf(w)) rest.push(w)
  }
  // The learner's own sentence first; the dictionary's for the words that have none.
  const ask = rest.slice(0, (ROUND_SIZE - out.length) * 2)
  if (ask.length > 0) {
    const examples = await listEntryExamples(supabase, ask.map((w) => entryOf(w)!)).catch(() => new Map())
    for (const w of ask) {
      if (out.length >= ROUND_SIZE) break
      const gap = findGap(examples.get(entryOf(w)!) ?? [], formsOf(w), w.lang)
      if (gap) out.push(toPrompt(w, gap))
    }
  }
  return shuffle(out, rand)
}

async function formsRound(supabase: SupabaseClient, words: PracticeWord[], rand: Rand): Promise<TypingPrompt[]> {
  const order = shuffle(words.filter((w) => w.lang === 'en' && !/\s/.test(w.headword.trim())), rand)
  const context = await listPracticeContext(supabase, order.map((w) => w.id))
  const entryIds = [...new Set(order.map((w) => context.get(w.id)?.entryId).filter((e): e is string => Boolean(e)))]
  const forms = await listEntryForms(supabase, entryIds)
  const out: TypingPrompt[] = []
  for (const w of order) {
    if (out.length >= ROUND_SIZE) break
    const q = pickFormQuestion(w.headword, forms.get(context.get(w.id)?.entryId ?? '') ?? [], rand)
    if (q) out.push(prompt(w, { cue: q.cue, answer: q.answers[0], accepted: q.answers.slice(1) }))
  }
  return out
}

/** The questions of one round of a typing mode, drawn from a window of the saved words. */
export async function typingRound(supabase: SupabaseClient, mode: TypingMode, rand: Rand = Math.random): Promise<TypingPrompt[]> {
  const words = (await listPracticeWords(supabase, { needsMeaning: mode === 'write' || mode === 'cloze' })).filter((w) => w.headword)
  switch (mode) {
    case 'write': return withChinese(supabase, shuffle(words.filter(hasMeaning), rand).slice(0, ROUND_SIZE))
    case 'dictation': return withChinese(supabase, shuffle(words, rand).slice(0, ROUND_SIZE))
    // Chinese keeps its pinyin in `ipa`, and typing a character from its pinyin is another skill.
    case 'ipa': return shuffle(words.filter((w) => w.lang !== 'zh' && readableIpa(w.ipa)), rand).slice(0, ROUND_SIZE).map((w) => prompt(w))
    case 'cloze': return clozeRound(supabase, words, rand)
    case 'forms': return formsRound(supabase, words, rand)
  }
}

/** The choice modes: pick a meaning for a word or its sound, or the word a phrase is missing. */
export type ChoiceMode = 'quiz' | 'listen' | 'phrase'

async function phraseRound(supabase: SupabaseClient, rand: Rand): Promise<QuizQuestion[]> {
  const phrases = shuffle((await listSavedPhrases(supabase)).filter((x) => gapSlot(x.headword, x.kind)), rand).slice(0, ROUND_SIZE)
  // Without knowing which fillers make real phrases, give in would be offered against give up.
  const existing = await listExistingPhrases(supabase, phrases.flatMap((x) => rivalPhrases(x.headword, x.kind)))
  return phrases.flatMap((x): QuizQuestion[] => {
    const g = buildPhraseGap(x, existing, rand)
    return g ? [{
      id: x.id, headword: x.headword, ipa: x.ipa, lang: 'en', options: g.options, answer: g.answer, audioUrl: x.audioUrl,
      gap: { before: g.before, after: g.after, meaningVi: x.meaningVi },
    }] : []
  })
}

/** The questions of one round of a choice mode. */
export async function choiceRound(supabase: SupabaseClient, mode: ChoiceMode, rand: Rand = Math.random): Promise<QuizQuestion[]> {
  if (mode === 'phrase') return phraseRound(supabase, rand)
  const all = await listPracticeWords(supabase, { needsMeaning: true })
  // Chinese has no recordings, and a browser without a Chinese voice would play nothing.
  const words = mode === 'listen' ? all.filter((x) => x.lang !== 'zh' || x.audioUrl) : all
  // Without these reads the distractors are drawn by language only.
  const entries = await listWordEntries(supabase, words.map((x) => x.id)).catch(() => new Map<string, { entryId: string | null; pos: string | null }>())
  const entryIds = [...entries.values()].flatMap((e) => (e.entryId ? [e.entryId] : []))
  const learner = await listLearnerDistractors(supabase, entryIds).catch(() => undefined)
  return buildQuiz(
    words.map((x) => ({
      id: x.id, headword: x.headword, ipa: x.ipa, lang: x.lang, meaningVi: x.meaningVi, audioUrl: x.audioUrl,
      entryId: entries.get(x.id)?.entryId ?? null, pos: entries.get(x.id)?.pos ?? null,
    })),
    ROUND_SIZE,
    rand,
    learner,
  )
}
