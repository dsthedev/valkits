import { describe, expect, it } from "vitest"
import { isUpgraderItemPrefab, withoutUpgraderItemGoals } from "./upgrader-items"
import { kitSchema } from "./schema"

describe("upgrader item filtering", () => {
  it("matches only armor and weapon upgrader prefabs", () => {
    expect(isUpgraderItemPrefab("Upgrader1Armor")).toBe(true)
    expect(isUpgraderItemPrefab("Upgrader7Weapon")).toBe(true)
    expect(isUpgraderItemPrefab("Item_Upgrader1Armor")).toBe(false)
    expect(isUpgraderItemPrefab("Upgrader1")).toBe(false)
    expect(isUpgraderItemPrefab("ArmorBronzeChest")).toBe(false)
  })

  it("removes upgrader goals without changing the saved kit", () => {
    const kit = kitSchema.parse({
      id: "kit-test",
      name: "Test kit",
      biome: "Meadows",
      itemGoals: [
        { prefab: "ArmorBronzeChest" },
        { prefab: "Upgrader1Armor" },
      ],
    })

    expect(withoutUpgraderItemGoals(kit).itemGoals).toEqual([
      { prefab: "ArmorBronzeChest" },
    ])
    expect(kit.itemGoals).toHaveLength(2)
  })
})
