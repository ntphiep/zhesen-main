import type { MetadataRoute } from 'next'
import { createContentClient } from '@/lib/supabase/content'
import { entryPath } from '@/lib/dictionary/entryId'
import { getSitemapCount, getSitemapPage, sitemapIds } from '@/lib/dictionary/sitemap'
import { SITE_URL } from '@/lib/site'

// One day: lex.sitemap_entries is refreshed nightly.
export const revalidate = 86400

/** The entries with a Vietnamese meaning, the ones the word page lets search engines index. */
export async function generateSitemaps(): Promise<{ id: number }[]> {
  return sitemapIds(await getSitemapCount(createContentClient()))
}

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const ids = await getSitemapPage(createContentClient(), Number(await id))
  return ids.map((entryId) => ({ url: `${SITE_URL}${entryPath(entryId)}` }))
}
