import { afterEach, describe, expect, it, vi } from "vitest"
import {
  KIT_STORAGE_KEY,
  MAX_KIT_IMPORT_LENGTH,
  addItemGoal,
  addKitToCollection,
  createKit,
  createKitId,
  createExampleKit,
  createKitCollection,
  exampleKitOptions,
  loadKitCollection,
  parseKitExport,
  removeItemGoal,
  removeKitFromCollection,
  saveKitCollection,
  serializeKitExport,
  selectKit,
  updateKitInCollection,
  updateItemGoal,
  type KitStorage,
} from "./kits"

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  it("creates a kit ID when crypto.randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {})

    expect(createKitId()).toMatch(/^kit-[a-z0-9]+-[a-z0-9]+$/)
  })

  it("round-trips an exported kit and rejects unsupported imports", () => {
    const kit = createKit("kit-1", "Starter", "Meadows")
    const imported = parseKitExport(serializeKitExport(kit))

    expect(imported).toEqual({ success: true, kit })
    expect(parseKitExport("not JSON")).toEqual({
      success: false,
      message: "The kit file is not valid JSON.",
    })
    expect(parseKitExport("x".repeat(MAX_KIT_IMPORT_LENGTH + 1))).toEqual({
      success: false,
      message: "The kit file is too large.",
    })
  })

  it("provides fresh kits from the checked-in example exports", () => {
    const first = createExampleKit("meadows-starter")
    const second = createExampleKit("meadows-starter")
    const trollKit = createExampleKit("troll-stuff")

    expect(first).toMatchObject({
      name: "Meadows Starter",
      biome: "Meadows",
    })
    expect(first.itemGoals.length).toBeGreaterThan(0)
    expect(first.id).not.toBe(second.id)
    expect(trollKit.name).toBe("troll stuff")
    expect(exampleKitOptions).toHaveLength(2)
    expect(() => createExampleKit("not-an-example")).toThrow(
      'Unknown example kit "not-an-example".',
    )
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

  it("updates and clears optional quantity and quality goals", () => {
    const kit = addItemGoal(createKit("kit-1", "Bronze", "Black Forest"), "BowFineWood")
    const updated = updateItemGoal(kit, "BowFineWood", {
      quantity: 2,
      targetQuality: 3,
    })
    const reset = updateItemGoal(updated, "BowFineWood", {
      quantity: null,
      targetQuality: null,
    })

    expect(updated.itemGoals[0]).toMatchObject({
      prefab: "BowFineWood",
      quantity: 2,
      targetQuality: 3,
    })
    expect(reset.itemGoals[0]).toEqual({ prefab: "BowFineWood" })
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