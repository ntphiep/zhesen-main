import { notFound } from 'next/navigation'
import { getContentSource } from '@/lib/content'
import { LessonRunner } from './LessonRunner'

export default async function Page({ params }: { params: Promise<{ lang: string; lessonId: string }> }) {
  const { lessonId } = await params
  const src = getContentSource()
  const lesson = await src.getLesson(lessonId)
  if (!lesson) notFound()
  const [vocab, pool] = await Promise.all([
    src.getVocab(lesson.vocabIds),
    src.getVocabByLang(lesson.lang),
  ])
  return <LessonRunner lesson={lesson} vocab={vocab} pool={pool} />
}
