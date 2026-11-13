import { describe, expect, it } from "vitest"
import {
  EXCLUSION_STORAGE_KEY,
  createExclusionSettings,
  filterExcludedItems,
  loadExclusionSettings,
  parseExclusionExport,
  saveExclusionSettings,
  serializeExclusionExport,
  setPrefabExcluded,
  type ExclusionStorage,
} from "./exclusions"

class MemoryStorage implements ExclusionStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe("item exclusions", () => {
  it("starts empty when storage has no saved settings", () => {
    const result = loadExclusionSettings(new MemoryStorage())

    expect(result.settings).toEqual({ version: 1, excludedPrefabs: [] })
    expect(result.warning).toBeNull()
  })

  it("recovers from malformed saved data without throwing", () => {
    const storage = new MemoryStorage()
    storage.setItem(EXCLUSION_STORAGE_KEY, "not-json")

    const result = loadExclusionSettings(storage)

    expect(result.settings.excludedPrefabs).toEqual([])
    expect(result.warning).toContain("could not be read")
  })

  it("persists normalized prefab identifiers", () => {
    const storage = new MemoryStorage()
    const settings = setPrefabExcluded(
      createExclusionSettings(["Wood", "Bronze"]),
      "Acorn",
      true,
    )

    expect(saveExclusionSettings(storage, settings)).toEqual({ success: true })
    expect(loadExclusionSettings(storage).settings.excludedPrefabs).toEqual([
      "Acorn",
      "Bronze",
      "Wood",
    ])
  })

  it("hides excluded items normally and includes them in manager mode", () => {
    const items = [{ prefab: "Acorn" }, { prefab: "Amber" }]
    const settings = createExclusionSettings(["Acorn"])

    expect(filterExcludedItems(items, settings, false)).toEqual([
      { prefab: "Amber" },
    ])
    expect(filterExcludedItems(items, settings, true)).toEqual(items)
  })

  it("validates imports, deduplicates entries, and retains unknown prefabs", () => {
    const imported = parseExclusionExport(
      JSON.stringify({
        version: 1,
        excludedPrefabs: ["FuturePrefab", "Acorn", "Acorn"],
      }),
    )
    const unsupported = parseExclusionExport(
      JSON.stringify({ version: 2, excludedPrefabs: ["Acorn"] }),
    )

    expect(imported.success).toBe(true)
    if (imported.success) {
      expect(imported.settings.excludedPrefabs).toEqual(["Acorn", "FuturePrefab"])
      expect(parseExclusionExport(serializeExclusionExport(imported.settings))).toEqual(
        imported,
      )
    }
    expect(unsupported.success).toBe(false)
  })
})