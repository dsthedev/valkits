import { describe, expect, it } from "vitest"
import { calculateKitStats } from "./kit-stat-calculation"
import type { GameItem, Kit } from "./schema"

const items: GameItem[] = [
  { prefab: "Food1", nameToken: "Food1", foodStats: { health: 10 } },
  { prefab: "Food2", nameToken: "Food2", foodStats: { stamina: 10 } },
  { prefab: "Food3", nameToken: "Food3", foodStats: { eitr: 5 } },
  { prefab: "Food4", nameToken: "Food4", foodStats: { health: 100 } },
  {
    prefab: "Chest",
    nameToken: "Chest",
    itemType: "Chest",
    armorStats: { armor: 8, armorPerLevel: 2 },
  },
  {
    prefab: "Shield1",
    nameToken: "Shield1",
    itemType: "Shield",
    armorStats: { armor: 2 },
    shieldStats: {
      blockPower: 6,
      blockPowerPerLevel: 6,
      deflectionForce: 20,
      deflectionForcePerLevel: 5,
      timedBlockBonus: 1.5,
    },
  },
  {
    prefab: "Shield2",
    nameToken: "Shield2",
    itemType: "Shield",
    armorStats: { armor: 50 },
    shieldStats: { blockPower: 100 },
  },
  {
    prefab: "Weapon",
    nameToken: "Weapon",
    itemType: "OneHandedWeapon",
    armorStats: { armor: 100 },
  },
]

const kit: Kit = {
  id: "kit-1",
  name: "Test",
  biome: "Meadows",
  itemGoals: [
    { prefab: "Food1" },
    { prefab: "Food2" },
    { prefab: "Food3" },
    { prefab: "Food4" },
    { prefab: "Chest", targetQuality: 3 },
    { prefab: "Shield1", targetQuality: 2 },
    { prefab: "Shield2" },
    { prefab: "Weapon" },
  ],
}

describe("kit stat calculation", () => {
  it("adds base stats, counts three foods, and scales equipped armor and shield quality", () => {
    const stats = calculateKitStats(
      kit,
      (prefab) => items.find((item) => item.prefab === prefab),
    )

    expect(stats.health).toEqual({
      base: 25,
      contributions: [{ prefab: "Food1", value: 10 }],
      total: 35,
    })
    expect(stats.stamina.total).toBe(60)
    expect(stats.eitr.total).toBe(5)
    expect(stats.ignoredFoodCount).toBe(1)
    expect(stats.armor).toEqual({
      base: 0,
      contributions: [
        { prefab: "Chest", value: 12 },
        { prefab: "Shield1", value: 2 },
        { prefab: "Shield2", value: 50 },
      ],
      total: 64,
    })
    expect(stats.shield).toEqual({
      prefab: "Shield1",
      blockPower: 12,
      deflectionForce: 25,
      timedBlockBonus: 1.5,
    })
  })
})