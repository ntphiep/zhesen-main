import type { Metadata } from 'next'
import { HomeSwitch } from '@/components/home/HomeSwitch'
import { SITE_URL } from '@/lib/site'
import { Landing } from '@/components/home/Landing'
import { loadDaily, loadExample, loadPhrases, loadTake } from '@/lib/home/landing'
import { worldFacts } from '@/lib/home/worldFacts'
import stats from '@/lib/home/world/stats.json'

// Every read below is cached for an hour or longer, so the page is rebuilt at most hourly.
export const revalidate = 3600

// Here and not in the layout, which every route inherits.
export const metadata: Metadata = { alternates: { canonical: '/' } }

/** schema.org `WebSite`; `/dictionary` reads its query from `?q=`. */
const WEBSITE_JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Zhesen',
  url: `${SITE_URL}/`,
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/dictionary?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
})

/** One cached page for everyone: the landing for a visitor, the reader's home for an
 *  account. Which one shows is decided in the browser (components/home/HomeSwitch.tsx). */
export default async function Home() {
  const [example, take, phrases, daily] = await Promise.all([loadExample(), loadTake(), loadPhrases(), loadDaily()])
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: WEBSITE_JSON_LD }} />
      <HomeSwitch
        landing={<Landing example={example} facts={worldFacts(stats)} take={take} phrases={phrases} />}
        daily={daily}
      />
    </>
  )
}
