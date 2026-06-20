import Link from 'next/link'
import { LookupHero } from './LookupHero'
import { SenseList } from './SenseList'
import { CharacterPanel } from './CharacterPanel'
import { RelatedWords } from './RelatedWords'
import { CrossLanguagePanel } from './CrossLanguagePanel'
import { ExampleList } from './ExampleList'
import type { DictEntryDetail, CharInfo, CrossLangSibling } from '@/lib/dictionary/types'

export function LookupView({ detail, characters, siblings }: {
  detail: DictEntryDetail
  characters: CharInfo[]
  siblings: CrossLangSibling[]
}) {
  const hanViet = characters.map((c) => c.hanViet[0]).filter(Boolean).join(' ') || null
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <Link href="/dictionary" className="text-sm text-black/50 hover:underline">← Tra cứu</Link>
      <LookupHero detail={detail} hanViet={detail.lang === 'zh' ? hanViet : null} />
      <SenseList senses={detail.senses} />
      {detail.lang === 'zh' && <CharacterPanel characters={characters} />}
      <RelatedWords relations={detail.relations} lang={detail.lang} />
      <CrossLanguagePanel siblings={siblings} />
      <ExampleList examples={detail.examples} lang={detail.lang} />
    </main>
  )
}
