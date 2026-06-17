import type { ContentSource } from './ContentSource'
import { LocalContentSource } from './LocalContentSource'

export type { ContentSource } from './ContentSource'

let instance: ContentSource | null = null
export function getContentSource(): ContentSource {
  if (!instance) instance = new LocalContentSource()
  return instance
}
