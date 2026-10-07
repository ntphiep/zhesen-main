import { Suspense } from 'react'
import Link from 'next/link'
import { AddToWordlistButton } from '@/components/lookup/AddToWordlistButton'
import { AudioButton } from '@/components/ui/AudioButton'
import { Ipa } from '@/components/ui/Ipa'
import { entryPath } from '@/lib/dictionary/entryId'
import { theoryBlockPath, toeicTopicPath } from '@/lib/theory/path'
import { PageHead } from './BlockPage'
import { NextPage } from './ToeicParts'
import { ToeicTopicSave } from './ToeicTopicSave'
import s from './Theory.module.css'
import type { ToeicStudyWord } from '@/lib/theory/toeicStudy'
import type { ToeicGuide, ToeicWordTopic } from '@/lib/theory/types'
import type { Language, LangCode } from '@/lib/languages'

/** `/theory/[lang]/toeic/topic/[topic]`: every word of one topic with the sense the test
 *  uses, a sentence of that sense, its sound and a save, then the next topic. */
export function ToeicTopicView({ language, guide, topic, words }: {
  language: Language
  guide: ToeicGuide
  topic: ToeicWordTopic
  words: ToeicStudyWord[]
}) {
  const next = guide.wordTopics[guide.wordTopics.findIndex((t) => t.id === topic.id) + 1]
  return (
    <ToeicWordsPage
      language={language}
      title={topic.titleVi}
      lede="Nghĩa ghi theo cách dùng trong đề."
      path={toeicTopicPath(language.code, topic.id)}
      scope="chủ đề"
      words={words}
      next={next && { href: toeicTopicPath(language.code, next.id), title: next.titleVi }}
    />
  )
}

/** A page of TOEIC words, a topic's or a page of the list: a save for all of them, a card
 *  per word, then the next page. `footer` carries what the page must credit. */
export function ToeicWordsPage({ language, title, lede, path, scope, words, next, footer }: {
  language: Language
  title: string
  lede: string
  path: string
  /** What "save all" names: "chủ đề" or "nhóm". */
  scope: string
  words: ToeicStudyWord[]
  next?: { href: string; title: string }
  footer?: React.ReactNode
}) {
  const drafts = words.flatMap((w) => (w.draft ? [w.draft] : []))
  return (
    <main className={`${s.page} font-ui`} data-l={language.code}>
      <PageHead
        language={language}
        back={{ href: theoryBlockPath(language.code, 'toeic'), label: 'Luyện thi TOEIC' }}
        title={title}
        lede={lede}
      >
        {drafts.length > 0 && (
          <div className="mt-5">
            <ToeicTopicSave lang={language.code} path={path} drafts={drafts} scope={scope} />
          </div>
        )}
      </PageHead>

      <div className={`${s.body} mx-auto max-w-page px-6`}>
        <ul className={`${s.grid} m-0 list-none p-0`} data-reveal="">
          {words.map((w) => <WordCard key={w.word} lang={language.code} path={path} word={w} />)}
        </ul>
        {next && <NextPage href={next.href} title={next.title} prefetch={false} />}
        {footer}
      </div>
    </main>
  )
}

function WordCard({ lang, path, word: w }: { lang: LangCode; path: string; word: ToeicStudyWord }) {
  return (
    <li className={`${s.card} flex flex-col gap-2.5`} data-accent="">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {/* No prefetch: a topic shows a dozen words, each a word page rendered on demand. */}
        {w.entry
          ? <Link href={entryPath(w.entry.id)} prefetch={false} className={`${s.hw} ${s.headword}`} lang={lang}>{w.word}</Link>
          : <span className={`${s.hw} ${s.headword}`} lang={lang}>{w.word}</span>}
        {w.entry && <Ipa value={w.entry.ipa} lang={lang} className={s.pron} />}
        {w.entry && <AudioButton text={w.entry.headword} lang={lang} audioUrl={w.entry.audioUrl} />}
      </div>
      {w.vi && <p className={s.meaning}>{w.vi}</p>}
      {w.definition && <p className={s.note} lang="en">{w.definition}</p>}
      {w.example && (
        <div className={s.example}>
          <p className={s.src} lang={lang}>{w.example.text}</p>
          <p className={s.vi}>{w.example.vi}</p>
          {w.example.byModel && <p className={s.label}>câu soạn mới</p>}
        </div>
      )}
      {w.entry && w.draft && (
        <div className="mt-auto pt-1">
          <Suspense><AddToWordlistButton entry={w.entry} draft={w.draft} returnTo={path} /></Suspense>
        </div>
      )}
    </li>
  )
}
