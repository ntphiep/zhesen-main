import type { ProgressStore } from './ProgressStore'
import { LocalProgressStore } from './LocalProgressStore'
import { LocalStorageKV } from './kv'

let instance: ProgressStore | null = null
export function getProgressStore(): ProgressStore {
  if (!instance) instance = new LocalProgressStore(new LocalStorageKV())
  return instance
}
