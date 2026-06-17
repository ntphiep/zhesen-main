import type { Grade, SrsState } from './types'

export const DAY_MS = 86_400_000
const MIN_EASE = 1.3
const START_EASE = 2.5

export function initialSrsState(vocabId: string, now: number): SrsState {
  return {
    vocabId,
    intervalDays: 0,
    ease: START_EASE,
    reps: 0,
    lapses: 0,
    dueAt: now,
    lastReviewedAt: null,
  }
}

function clampEase(e: number): number {
  return Math.max(MIN_EASE, e)
}

export function review(state: SrsState, grade: Grade, now: number): SrsState {
  const base = { ...state, lastReviewedAt: now }

  if (grade === 'again') {
    return {
      ...base,
      reps: 0,
      lapses: state.lapses + 1,
      ease: clampEase(state.ease - 0.2),
      intervalDays: 0,
      dueAt: now,
    }
  }

  const reps = state.reps + 1
  let ease = state.ease
  let interval: number

  if (grade === 'hard') {
    ease = clampEase(state.ease - 0.15)
    interval = Math.max(1, Math.round((state.intervalDays || 1) * 1.2))
  } else if (grade === 'good') {
    if (reps === 1) interval = 1
    else if (reps === 2) interval = 6
    else interval = Math.round(state.intervalDays * ease)
  } else {
    // easy
    ease = state.ease + 0.15
    if (reps === 1) interval = 2
    else if (reps === 2) interval = 8
    else interval = Math.round(state.intervalDays * ease * 1.3)
  }

  return {
    ...base,
    reps,
    ease,
    intervalDays: interval,
    dueAt: now + interval * DAY_MS,
  }
}
