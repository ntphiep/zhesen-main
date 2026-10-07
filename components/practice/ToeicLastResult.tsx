'use client'
import Link from 'next/link'
import { useStoredPref } from '@/lib/hooks/useStoredPref'
import {
  clock, HISTORY_KEY, parseHistory, parseProgress, PROGRESS_KEY, serializeHistory, serializeProgress, toeicTestPath,
} from '@/lib/practice/toeic/session'
import t from './Toeic.module.css'

/** One test's unfinished session and last result in this browser, or nothing. */
export function ToeicLastResult({ testId }: { testId: string }) {
  const [history] = useStoredPref(HISTORY_KEY, parseHistory, serializeHistory)
  const [progress] = useStoredPref(PROGRESS_KEY, parseProgress, serializeProgress)
  const last = history[testId]
  const open = progress[testId]
  return (
    <>
      {open && (
        <p className={t.last}>
          Đang làm dở, {open.session.label}{open.left !== null && `, còn ${clock(open.left)}`}.{' '}
          <Link href={toeicTestPath(testId)} prefetch={false}>Làm tiếp</Link>
        </p>
      )}
      {last && (
        <p className={t.last}>
          Lần gần nhất, {last.label}: <b>{last.correct}/{last.total}</b>
          {last.score && <>, Reading ước tính <b>{last.score.low} đến {last.score.high}</b></>}
        </p>
      )}
    </>
  )
}
