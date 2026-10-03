/** Words reviewed per day the reader can aim for. Today's count is `reviewedToday`, the words
 *  whose last review falls on today in the study timezone (`lib/wordlist/stats.ts`). */
export const GOAL_CHOICES = [10, 20, 30, 50] as const

export type DailyGoal = (typeof GOAL_CHOICES)[number]

export const DEFAULT_GOAL: DailyGoal = 20

/** A stored value that is not one of the choices reads as the default. */
export function parseGoal(raw: string | null): DailyGoal {
  return GOAL_CHOICES.find((g) => raw !== null && String(g) === raw) ?? DEFAULT_GOAL
}

export interface GoalProgress {
  done: number
  goal: number
  left: number
  /** 0 to 1, full once the goal is met. */
  share: number
  met: boolean
}

export function goalProgress(done: number, goal: number): GoalProgress {
  return { done, goal, left: Math.max(0, goal - done), share: Math.min(1, done / goal), met: done >= goal }
}
