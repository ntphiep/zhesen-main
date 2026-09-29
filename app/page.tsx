import { Landing } from '@/components/home/Landing'
import { loadExample, loadTake, slips } from '@/lib/home/landing'
import { worldFacts } from '@/lib/home/worldFacts'
import stats from '@/lib/home/world/stats.json'

// Every read below is cached for an hour or longer, so the page is rebuilt at most hourly.
export const revalidate = 3600

export default async function Home() {
  const [example, take] = await Promise.all([loadExample(), loadTake()])
  return <Landing example={example} facts={worldFacts(stats)} take={take} slips={slips()} />
}
