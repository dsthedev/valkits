import { describe, expect, it } from "vitest"
import {
  COLLECTED_RESOURCES_STORAGE_KEY,
  loadCollectedResources,
  saveCollectedResources,
  type CollectedResourcesStorage,
} from "./collected-resources"

function createStorage(initialValue: string | null = null) {
  let value = initialValue
  const storage: CollectedResourcesStorage = {
    getItem(key) {
      expect(key).toBe(COLLECTED_RESOURCES_STORAGE_KEY)
      return value
    },
    setItem(key, nextValue) {
      expect(key).toBe(COLLECTED_RESOURCES_STORAGE_KEY)
      value = nextValue
    },
  }
  return { storage, read: () => value }
}

describe("collected resources", () => {
  it("loads saved resources by kit and recovers from malformed data", () => {
    const { storage } = createStorage(
      JSON.stringify({
        version: 1,
        kits: [{ kitId: "kit-a", prefabs: ["Wood", "Wood"] }],
      })
    )
    expect(loadCollectedResources(storage)).toEqual({
      prefabsByKit: { "kit-a": ["Wood"] },
      warning: null,
    })

    const malformed = createStorage("{")
    expect(loadCollectedResources(malformed.storage)).toMatchObject({
      prefabsByKit: {},
      warning: expect.any(String),
    })
  })

  it("saves and clears a kit without changing other kits", () => {
    const { storage, read } = createStorage(
      JSON.stringify({
        version: 1,
        kits: [
          { kitId: "kit-a", prefabs: ["Wood"] },
          { kitId: "kit-b", prefabs: ["Stone"] },
        ],
      })
    )

    expect(saveCollectedResources(storage, "kit-a", ["Wood", "Iron"])).toEqual({
      success: true,
    })
    expect(loadCollectedResources(storage).prefabsByKit).toEqual({
      "kit-a": ["Wood", "Iron"],
      "kit-b": ["Stone"],
    })

    expect(saveCollectedResources(storage, "kit-a", [])).toEqual({
      success: true,
    })
    expect(loadCollectedResources(storage).prefabsByKit).toEqual({
      "kit-b": ["Stone"],
    })
    expect(read()).not.toBeNull()
  })

  it("reports unavailable or failing storage", () => {
    expect(saveCollectedResources(undefined, "kit-a", ["Wood"])).toMatchObject({
      success: false,
    })

    const brokenStorage: CollectedResourcesStorage = {
      getItem() {
        return null
      },
      setItem() {
        throw new Error("storage full")
      },
    }
    expect(saveCollectedResources(brokenStorage, "kit-a", ["Wood"])).toEqual({
      success: false,
      message: "Collected resources could not be saved in browser storage.",
    })
  })
})
