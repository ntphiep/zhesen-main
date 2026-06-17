export interface KVBackend {
  get(key: string): string | null
  set(key: string, value: string): void
}

export class InMemoryKV implements KVBackend {
  private store = new Map<string, string>()
  get(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }
  set(key: string, value: string): void {
    this.store.set(key, value)
  }
}

export class LocalStorageKV implements KVBackend {
  get(key: string): string | null {
    return window.localStorage.getItem(key)
  }
  set(key: string, value: string): void {
    window.localStorage.setItem(key, value)
  }
}
