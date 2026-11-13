import { describe, expect, it } from "vitest"
import {
  KIT_STORAGE_KEY,
  addItemGoal,
  addKitToCollection,
  createKit,
  createKitCollection,
  loadKitCollection,
  removeItemGoal,
  removeKitFromCollection,
  saveKitCollection,
  selectKit,
  updateKitInCollection,
  type KitStorage,
} from "./kits"

class MemoryStorage implements KitStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe("kit collection", () => {
  it("creates, selects, and persists kits with an active-kit reference", () => {
    const storage = new MemoryStorage()
    const starterKit = createKit("kit-1", "Starter", "Meadows")
    const collection = selectKit(
      addKitToCollection(createKitCollection(), starterKit),
      starterKit.id,
    )

    expect(collection.activeKitId).toBe("kit-1")
    expect(saveKitCollection(storage, collection)).toEqual({ success: true })
    expect(loadKitCollection(storage).collection).toEqual(collection)
    expect(storage.getItem(KIT_STORAGE_KEY)).not.toBeNull()
  })

  it("recovers safely from malformed saved collections", () => {
    const storage = new MemoryStorage()
    storage.setItem(KIT_STORAGE_KEY, "not-json")

    const result = loadKitCollection(storage)

    expect(result.collection).toEqual(createKitCollection())
    expect(result.warning).toContain("could not be read")
  })

  it("adds one goal per prefab and supports removing it", () => {
    const kit = createKit("kit-1", "Starter", "Meadows")
    const withAcorn = addItemGoal(kit, "Acorn")

    expect(addItemGoal(withAcorn, "Acorn").itemGoals).toHaveLength(1)
    expect(removeItemGoal(withAcorn, "Acorn").itemGoals).toEqual([])
  })

  it("updates a kit without changing its active selection", () => {
    const starterKit = createKit("kit-1", "Starter", "Meadows")
    const collection = addKitToCollection(createKitCollection(), starterKit)
    const updatedKit = createKit("kit-1", "Meadows Start", "Meadows")

    const updatedCollection = updateKitInCollection(collection, updatedKit)

    expect(updatedCollection.activeKitId).toBe("kit-1")
    expect(updatedCollection.kits[0]?.name).toBe("Meadows Start")
  })

  it("selects a remaining kit when the active kit is removed", () => {
    const firstKit = createKit("kit-1", "Starter", "Meadows")
    const secondKit = createKit("kit-2", "Swamp", "Swamp")
    const collection = selectKit(
      addKitToCollection(addKitToCollection(createKitCollection(), firstKit), secondKit),
      firstKit.id,
    )

    const remaining = removeKitFromCollection(collection, firstKit.id)

    expect(remaining.kits.map((kit) => kit.id)).toEqual(["kit-2"])
    expect(remaining.activeKitId).toBe("kit-2")
  })
})