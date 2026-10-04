import { z } from '@/lib/zod'
import type { TextLookup } from './textLookup'

/** The browser half of the passage lookup. Apart from `./textLookup` because that module
 *  resolves tokens on the server, and its imports reach the server-only secrets. */

/** The wire format of `POST /dictionary/text/lookup`, parsed by the browser rather than cast. */
const langCode = z.enum(['zh', 'es', 'en'])

const entryPreview = z.object({
  id: z.string(),
  lang: langCode,
  headword: z.string(),
  traditional: z.string().nullable(),
  level: z.string().nullable(),
  ipa: z.string().nullable(),
  pos: z.string().nullable(),
  glossVi: z.string().nullable(),
  glossEn: z.string().nullable(),
  audioUrl: z.string().nullable(),
  frequencyRank: z.number().nullable().optional(),
  matchScore: z.number().nullable().optional(),
})

export const textLookupResponse = z.object({
  lang: langCode,
  words: z.object({ text: z.string(), entry: entryPreview.nullable() }).array(),
  phrases: z.object({ text: z.string(), entry: entryPreview }).array().default([]),
})

export type TextLookupOutcome =
  | { status: 'ok'; data: TextLookup }
  | { status: 'refused'; message: string }

/** Layer one, through the route: the browser holds no Supabase credentials for `lex` and
 *  the per-address budget lives on the server. */
export async function fetchTextLookup(text: string, signal?: AbortSignal): Promise<TextLookupOutcome> {
  const res = await fetch('/dictionary/text/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body as { error?: unknown } | null)?.error
    return { status: 'refused', message: typeof message === 'string' ? message : 'Chưa tra được đoạn này. Thử lại.' }
  }
  return { status: 'ok', data: textLookupResponse.parse(body) }
}
