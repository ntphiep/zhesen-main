import type { GrammarPoint } from './types'

export interface GrammarCategoryGroup {
  categoryVi: string
  points: GrammarPoint[]
}

export interface GrammarLevelGroup {
  level: string
  categories: GrammarCategoryGroup[]
}

/** Group an already level-ordered list of grammar points into level and category buckets.
 *  A pure regroup, not a sort: input order within a bucket is preserved because the query
 *  ordered by `sort_order`. A missing category or level falls into "Khác", never dropped. */
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
