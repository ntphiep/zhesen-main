import { notFound } from 'next/navigation'
import { getLanguage, isLangCode } from '@/lib/languages'
import { findToeicGroup, TOEIC_GROUP_SIZE } from '@/lib/theory/content'
import { toeicGroupPath } from '@/lib/theory/path'
import { loadToeicGroup } from '@/lib/theory/toeicStudy'
import { ToeicWordsPage } from '@/components/theory/ToeicTopicView'
import s from '@/components/theory/Theory.module.css'

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'
import { TheoryBreadcrumb } from '@/components/seo/BreadcrumbJsonLd'

/** Empty on purpose, as for a topic: a page reads 25 entries, and 50 pages at once is the
 *  shape of read that timed out the build in #28. */
export function generateStaticParams(): { lang: string; group: string }[] {
  return []
}

// One week, the literal value of `LEX_REVALIDATE` in `lib/dictionary/cached.ts`.
export const revalidate = 604800

type Params = Promise<{ lang: string; group: string }>

const SOURCE = 'https://www.newgeneralservicelist.com/toeic-service-list'

const num = (n: number) => n.toLocaleString('vi-VN')

const span = (g: { n: number; words: readonly unknown[] }) =>
  `${num((g.n - 1) * TOEIC_GROUP_SIZE + 1)} đến ${num((g.n - 1) * TOEIC_GROUP_SIZE + g.words.length)}`

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, group } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  const g = language && findToeicGroup(language.code, group)
  if (!language || !g) return {}
  return pageMetadata({
    title: `Từ vựng TOEIC ${span(g)}`,
    description: `Học ${g.words.length} từ hay gặp trong đề TOEIC, thứ ${span(g)} theo tần suất, với nghĩa, phát âm và câu ví dụ.`,
    canonical: toeicGroupPath(language.code, g.n),
  })
}

export default async function ToeicGroupPage({ params }: { params: Params }) {
  const { lang, group } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  // Decided from the list itself before any read, so a cached 404 can never be wrong.
  const g = language && findToeicGroup(language.code, group)
  if (!language || !g) notFound()
  const words = await loadToeicGroup(language.code, g.words)
  const title = `Từ TOEIC ${span(g)}`
  const next = findToeicGroup(language.code, String(g.n + 1))
  return (
    <>
      <TheoryBreadcrumb language={language} block="toeic" leaf={title} />
      <ToeicWordsPage
        language={language}
        title={title}
        lede="Xếp theo tần suất trong đề. Dòng tiếng Anh là định nghĩa của danh sách."
        path={toeicGroupPath(language.code, g.n)}
        scope="nhóm"
        words={words}
        next={next && { href: toeicGroupPath(language.code, next.n), title: `Từ TOEIC ${span(next)}` }}
        footer={
          <p className={s.note} data-gap="">
            Danh sách <a href={SOURCE} rel="noopener">TOEIC Service List 1.2</a> của Browne và Culligan,
            giấy phép <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener">CC BY-SA 4.0</a>.
            Nghĩa tiếng Việt và câu ví dụ do Zhesen bổ sung.
          </p>
        }
      />
    </>
  )
}
