import { describe, expect, it } from "vitest"
import { selectVisualizerEquipment } from "./visualizer-equipment"
import type { GameItem, Kit } from "./schema"
import { getResourceCategory } from "./resource-category"

describe("resource categories", () => {
  it("groups food and consumable item types together", () => {
    expect(getResourceCategory("Consumable")).toBe("Food & consumables")
    expect(getResourceCategory("Fish")).toBe("Food & consumables")
  })

  it("groups materials and equipment item types", () => {
    expect(getResourceCategory("Material")).toBe("Materials")
    expect(getResourceCategory("OneHandedWeapon")).toBe("Gear & ammo")
    expect(getResourceCategory("Ammo")).toBe("Gear & ammo")
  })

  it("keeps missing and unclassified item types in Other", () => {
    expect(getResourceCategory("Misc")).toBe("Other")
    expect(getResourceCategory(undefined)).toBe("Other")
  })
})

describe("visualizer equipment", () => {
  it("groups equipment in kit order without classifying food or unknown items", () => {
    const items: GameItem[] = [
      { prefab: "Sword", nameToken: "Sword", itemType: "OneHandedWeapon" },
      { prefab: "Shield", nameToken: "Shield", itemType: "Shield" },
      { prefab: "Tool", nameToken: "Tool", itemType: "Tool" },
      { prefab: "Bow", nameToken: "Bow", itemType: "Bow" },
      { prefab: "Helmet", nameToken: "Helmet", itemType: "Helmet" },
      {
        prefab: "Food",
        nameToken: "Food",
        itemType: "Utility",
        foodStats: { health: 1 },
      },
      { prefab: "Ammo", nameToken: "Ammo", itemType: "Ammo" },
    ]
    const kit: Kit = {
      id: "test",
      name: "Test",
      biome: "Meadows",
      itemGoals: [
        "Sword",
        "Shield",
        "Food",
        "Tool",
        "Bow",
        "Ammo",
        "Missing",
        "Helmet",
      ].map((prefab) => ({ prefab })),
    }
    const result = selectVisualizerEquipment(kit, (prefab) =>
      items.find((item) => item.prefab === prefab)
    )

    expect(result.armorAndUtility.map(({ goal }) => goal.prefab)).toEqual([
      "Shield",
      "Tool",
      "Helmet",
    ])
    expect(result.weapons.map(({ goal }) => goal.prefab)).toEqual([
      "Sword",
      "Bow",
    ])
    expect(selectVisualizerEquipment(undefined, () => undefined)).toEqual({
      armorAndUtility: [],
      weapons: [],
    })
  })
})
