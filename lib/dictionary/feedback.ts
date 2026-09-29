/** What a word page report says is wrong, and its limits: the checks on
 *  `public.word_feedback` (supabase/migrations/0095_word_feedback.sql). */
export const FEEDBACK_KINDS = ['meaning', 'example', 'other'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

export const FEEDBACK_MESSAGE_MAX = 500
/** Applied, a suggestion becomes the sense's gloss_vi, and a gloss over 80 characters adds no
 *  term to lex.gloss_terms, so the Vietnamese lookup would stop finding the word through it. */
export const FEEDBACK_SUGGESTION_MAX = 80
