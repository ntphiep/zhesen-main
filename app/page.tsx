import { HomeSwitch } from '@/components/home/HomeSwitch'
import { Landing } from '@/components/home/Landing'
import { loadDaily, loadExample, loadPhrases, loadTake } from '@/lib/home/landing'
import { worldFacts } from '@/lib/home/worldFacts'
import stats from '@/lib/home/world/stats.json'

// Every read below is cached for an hour or longer, so the page is rebuilt at most hourly.
export const revalidate = 3600

/** One cached page for everyone: the landing for a visitor, the reader's home for an
 *  account. Which one shows is decided in the browser (components/home/HomeSwitch.tsx). */
export default async function Home() {
  const [example, take, phrases, daily] = await Promise.all([loadExample(), loadTake(), loadPhrases(), loadDaily()])
  return (
    <HomeSwitch
      landing={<Landing example={example} facts={worldFacts(stats)} take={take} phrases={phrases} />}
      daily={daily}
    />
  )
}
