import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import {
  KIT_STORAGE_KEY,
  MAX_KIT_IMPORT_LENGTH,
  addItemGoal,
  addExampleKitsToCollection,
  addKitToCollection,
  clearKitCollection,
  createKit,
  createKitId,
  createExampleKit,
  createKitCollection,
  loadExampleKitOptions,
  loadKitCollection,
  parseKitExport,
  reorderItemGoals,
  removeItemGoal,
  removeKitFromCollection,
  saveKitCollection,
  serializeKitExport,
  selectKit,
  updateKitInCollection,
  updateKitDetails,
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

function readPublicExample(fileName: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../../public/data/examples/${fileName}`, import.meta.url),
      "utf8"
    )
  )
}

function jsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    json: async () => data,
  } as Response
}

describe("kit collection", () => {
  it("clears every kit and the active-kit reference", () => {
    expect(clearKitCollection()).toEqual({
      version: 1,
      activeKitId: null,
      kits: [],
    })
  })

  it("creates, selects, and persists kits with an active-kit reference", () => {
    const storage = new MemoryStorage()
    const starterKit = createKit("kit-1", "Starter", "Meadows")
    const collection = selectKit(
      addKitToCollection(createKitCollection(), starterKit),
      starterKit.id
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
    const kit = createKit(
      "kit-1",
      "Starter",
      "Meadows",
      "First line\nSecond line"
    )
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

  it("loads example options from the public catalog", async () => {
    const fetcher: typeof fetch = async () =>
      jsonResponse(readPublicExample("catalog.json"))

    const options = await loadExampleKitOptions(fetcher)

    expect(options).toHaveLength(14)
    expect(options).toContainEqual({
      id: "meadows-min-set",
      name: "Meadows Min Set",
      biome: "Meadows",
    })
    expect(options).toContainEqual({
      id: "ashlands-max-set",
      name: "Ashlands Max Set",
      biome: "Ashlands",
    })
  })

  it("fetches example exports and creates fresh kits", async () => {
    const fetcher: typeof fetch = async (input) => {
      const fileName = String(input).split("/").at(-1) ?? ""
      return jsonResponse(readPublicExample(fileName))
    }
    const first = await createExampleKit("meadows-min-set", fetcher)
    const second = await createExampleKit("meadows-min-set", fetcher)
    const ashlandsKit = await createExampleKit("ashlands-max-set", fetcher)

    expect(first).toMatchObject({
      name: "Meadows Min Set",
      biome: "Meadows",
    })
    expect(first.itemGoals.length).toBeGreaterThan(0)
    expect(first.id).not.toBe(second.id)
    expect(ashlandsKit.name).toBe("Ashlands Max Set")
    await expect(
      createExampleKit("not-an-example", async () => jsonResponse({}, false))
    ).rejects.toThrow('Unknown example kit "not-an-example".')
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

  it("reorders visible goals while preserving hidden goal slots", () => {
    const kit = createKit("kit-1", "Starter", "Meadows")
    const withGoals = addItemGoal(
      addItemGoal(addItemGoal(addItemGoal(kit, "Acorn"), "HiddenGoal"), "Wood"),
      "Stone"
    )

    expect(
      reorderItemGoals(withGoals, ["Stone", "Wood", "Acorn"]).itemGoals.map(
        (goal) => goal.prefab
      )
    ).toEqual(["Stone", "HiddenGoal", "Wood", "Acorn"])
    expect(reorderItemGoals(withGoals, ["Unknown"])).toBe(withGoals)
    expect(reorderItemGoals(withGoals, ["Wood", "Wood"])).toBe(withGoals)
  })

  it("updates and clears optional quantity and quality goals", () => {
    const kit = addItemGoal(
      createKit("kit-1", "Bronze", "Black Forest"),
      "BowFineWood"
    )
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

  it("preserves multiline kit descriptions and supports clearing them", () => {
    const starterKit = createKit(
      "kit-1",
      "Starter",
      "Meadows",
      "First line\nSecond line"
    )
    const updatedKit = updateKitDetails(
      starterKit,
      "Starter Plus",
      "Meadows",
      "A new note\nwith a second line"
    )
    const clearedKit = updateKitDetails(
      updatedKit,
      updatedKit.name,
      updatedKit.biome,
      ""
    )

    expect(starterKit.description).toBe("First line\nSecond line")
    expect(updatedKit.description).toBe("A new note\nwith a second line")
    expect(clearedKit.description).toBeUndefined()
  })

  it("adds only example kits that do not already match existing content", () => {
    const existing = addItemGoal(
      createKit("existing-id", "Meadows Min Set", "Meadows"),
      "ArmorRagsChest"
    )
    const collection = addKitToCollection(createKitCollection(), existing)
    const repeatedExample = {
      ...existing,
      id: "new-id",
    }
    const anotherExample = createKit("another-id", "Swamp Min Set", "Swamp")

    const updated = addExampleKitsToCollection(collection, [
      repeatedExample,
      anotherExample,
    ])

    expect(updated.kits.map((kit) => kit.name)).toEqual([
      "Meadows Min Set",
      "Swamp Min Set",
    ])
    expect(updated.activeKitId).toBe("existing-id")
  })

  it("selects a remaining kit when the active kit is removed", () => {
    const firstKit = createKit("kit-1", "Starter", "Meadows")
    const secondKit = createKit("kit-2", "Swamp", "Swamp")
    const collection = selectKit(
      addKitToCollection(
        addKitToCollection(createKitCollection(), firstKit),
        secondKit
      ),
      firstKit.id
    )

    const remaining = removeKitFromCollection(collection, firstKit.id)

    expect(remaining.kits.map((kit) => kit.id)).toEqual(["kit-2"])
    expect(remaining.activeKitId).toBe("kit-2")
  })
})
