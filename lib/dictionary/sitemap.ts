import { z } from '@/lib/zod'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Entries per dictionary sitemap, under Google's 50,000-URL limit. */
export const SITEMAP_PAGE_SIZE = 20000

/** How many entries the dictionary sitemaps list (`lex.sitemap_entries`, migration 0104). A
 *  `null` answer fails the parse, so a failed read throws rather than publishing no sitemaps. */
export async function getSitemapCount(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.schema('lex').rpc('sitemap_count')
  if (error) throw error
  return z.number().int().nonnegative().parse(data)
}

/** The entry ids of one sitemap, in a stable order. */
export async function getSitemapPage(supabase: SupabaseClient, page: number): Promise<string[]> {
  const { data, error } = await supabase.schema('lex').rpc('sitemap_page', { p_page: page, p_size: SITEMAP_PAGE_SIZE })
  if (error) throw error
  return z.array(z.string()).parse(data)
}

/** One sitemap per page of entries, as `generateSitemaps` returns them. */
export function sitemapIds(count: number): { id: number }[] {
  return Array.from({ length: Math.ceil(count / SITEMAP_PAGE_SIZE) }, (_, id) => ({ id }))
}

/** Where Next serves the sitemap `generateSitemaps` names `id` (app/dictionary/sitemap.ts). */
export function dictionarySitemapPath(id: number): string {
  return `/dictionary/sitemap/${id}.xml`
}
