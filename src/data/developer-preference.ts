import { z } from "zod"

const storageKey = "valkits.developer-mode.v1"
const preferenceSchema = z.object({ version: z.literal(1), enabled: z.boolean() }).strict()

interface PreferenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function loadDeveloperPreference(storage?: PreferenceStorage) {
  try {
    const stored = storage?.getItem(storageKey)
    if (!stored) return false
    const parsed = preferenceSchema.safeParse(JSON.parse(stored))
    return parsed.success ? parsed.data.enabled : false
  } catch {
    return false
  }
}

export function saveDeveloperPreference(storage: PreferenceStorage | undefined, enabled: boolean) {
  try {
    if (!storage) return false
    storage.setItem(storageKey, JSON.stringify({ version: 1, enabled }))
    return true
  } catch {
    return false
  }
}