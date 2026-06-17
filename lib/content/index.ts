import type { ContentSource } from './ContentSource'
import { SupabaseContentSource } from './SupabaseContentSource'

export type { ContentSource } from './ContentSource'

let instance: ContentSource | null = null
export function getContentSource(): ContentSource {
  if (!instance) instance = new SupabaseContentSource()
  return instance
}
