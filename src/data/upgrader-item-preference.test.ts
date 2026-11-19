import { describe, expect, it } from "vitest"
import {
  UPGRADER_ITEM_PREFERENCE_STORAGE_KEY,
  loadUpgraderItemPreference,
  saveUpgraderItemPreference,
  type UpgraderItemPreferenceStorage,
} from "./upgrader-item-preference"

class MemoryStorage implements UpgraderItemPreferenceStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe("upgrader item preference", () => {
  it("defaults to hiding upgrader items when storage is empty", () => {
    expect(loadUpgraderItemPreference(new MemoryStorage())).toEqual({
      hideUpgraderItems: true,
      warning: null,
    })
  })

  it("persists and reloads the visibility preference", () => {
    const storage = new MemoryStorage()

    expect(saveUpgraderItemPreference(storage, true)).toEqual({ success: true })
    expect(storage.getItem(UPGRADER_ITEM_PREFERENCE_STORAGE_KEY)).toBe(
      JSON.stringify({ version: 1, hideUpgraderItems: true }),
    )
    expect(loadUpgraderItemPreference(storage)).toEqual({
      hideUpgraderItems: true,
      warning: null,
    })
  })

  it("recovers from invalid stored preferences", () => {
    const storage = new MemoryStorage()
    storage.setItem(UPGRADER_ITEM_PREFERENCE_STORAGE_KEY, "not-json")

    expect(loadUpgraderItemPreference(storage)).toEqual({
      hideUpgraderItems: true,
      warning: expect.stringContaining("could not be read"),
    })
  })
})
