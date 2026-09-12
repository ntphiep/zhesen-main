import type { GrammarPoint } from './types'

export interface GrammarCategoryGroup {
  categoryVi: string
  points: GrammarPoint[]
}

export interface GrammarLevelGroup {
  level: string
  categories: GrammarCategoryGroup[]
}

/**
 * Groups an already level-ordered list of grammar points into level -> category
 * buckets for the `/grammar/[lang]` overview. Input order within a level/category
 * is preserved (the query orders by `sort_order`), so this is a pure regroup, not
 * a sort. A missing category_vi/level falls back to a single "Khác" bucket rather
 * than being dropped.
 */
export function groupByLevelAndCategory(points: GrammarPoint[]): GrammarLevelGroup[] {
  const levels: GrammarLevelGroup[] = []
  for (const p of points) {
    const level = p.level ?? 'Khác'
    const category = p.categoryVi ?? 'Khác'
    let levelGroup = levels.find((l) => l.level === level)
    if (!levelGroup) { levelGroup = { level, categories: [] }; levels.push(levelGroup) }
    let catGroup = levelGroup.categories.find((c) => c.categoryVi === category)
    if (!catGroup) { catGroup = { categoryVi: category, points: [] }; levelGroup.categories.push(catGroup) }
    catGroup.points.push(p)
  }
  return levels
}
