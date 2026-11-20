import { describe, expect, it } from "vitest"
import {
  FAVORITES_STORAGE_KEY,
  loadFavoritePrefabs,
  prioritizeFavorites,
  saveFavoritePrefabs,
  type FavoritesStorage,
} from "./favorites"

class MemoryStorage implements FavoritesStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe("item favorites", () => {
  it("starts empty when storage has no saved favorites", () => {
    expect(loadFavoritePrefabs(new MemoryStorage())).toEqual({
      prefabs: [],
      warning: null,
    })
  })

  it("recovers safely from malformed saved favorites", () => {
    const storage = new MemoryStorage()
    storage.setItem(FAVORITES_STORAGE_KEY, "not-json")

    const result = loadFavoritePrefabs(storage)

    expect(result.prefabs).toEqual([])
    expect(result.warning).toContain("could not be read")
  })

  it("persists unique prefab IDs", () => {
    const storage = new MemoryStorage()

    expect(saveFavoritePrefabs(storage, ["Acorn", "Wood", "Acorn"])).toEqual({
      success: true,
    })
    expect(loadFavoritePrefabs(storage).prefabs).toEqual(["Acorn", "Wood"])
  })

  it("prioritizes favorites while preserving order within each group", () => {
    const items = [
      { prefab: "Acorn" },
      { prefab: "Wood" },
      { prefab: "Amber" },
      { prefab: "Stone" },
    ]

    expect(
      prioritizeFavorites(items, new Set(["Wood", "Stone"])).map(
        (item) => item.prefab,
      ),
    ).toEqual(["Wood", "Stone", "Acorn", "Amber"])
    expect(items.map((item) => item.prefab)).toEqual([
      "Acorn",
      "Wood",
      "Amber",
      "Stone",
    ])
  })
})