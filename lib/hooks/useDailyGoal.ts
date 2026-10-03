'use client'
import { parseGoal, type DailyGoal } from '@/lib/wordlist/goal'
import { useStoredPref } from './useStoredPref'

/** Per browser, like the home layout and the theme: `public.profiles` holds no preferences. */
const KEY = 'zhesen:daily-goal'

const serialize = (g: DailyGoal) => String(g)

export function useDailyGoal(): [DailyGoal, (goal: DailyGoal) => void] {
  return useStoredPref<DailyGoal>(KEY, parseGoal, serialize)
}
