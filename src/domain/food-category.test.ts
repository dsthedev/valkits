import { describe, expect, it } from "vitest"
import { gameItemSchema, type GameItem, type Kit } from "./schema"
import { getFoodCategory, selectVisualizerFoods } from "./food-category"

function item(foodStats?: {
  health?: number
  stamina?: number
  eitr?: number
}) {
  return gameItemSchema.parse({
    prefab: "Food",
    nameToken: "$item_food",
    foodStats,
  })
}

describe("food category", () => {
  it("classifies foods by their highest stat", () => {
    expect(getFoodCategory(item({ health: 30, stamina: 10 }))).toBe("health")
    expect(getFoodCategory(item({ health: 7, stamina: 20 }))).toBe("stamina")
    expect(getFoodCategory(item({ health: 0, stamina: 0, eitr: 25 }))).toBe(
      "eitr"
    )
  })

  it("treats ties and foods without positive stats as mixed", () => {
    expect(getFoodCategory(item({ health: 23, stamina: 23 }))).toBe("mixed")
    expect(getFoodCategory(item({ health: 0, stamina: 0 }))).toBe("mixed")
  })

  it("returns no category for items without food stats", () => {
    expect(getFoodCategory(item())).toBeUndefined()
  })
})

describe("visualizer food selection", () => {
  const items: GameItem[] = [
    ...["Food1", "Food2", "Food3", "Food4"].map((prefab) => ({
      prefab,
      nameToken: prefab,
      foodStats: { health: 10 },
    })),
    { prefab: "Sword", nameToken: "Sword" },
  ]
  const getItem = (prefab: string) =>
    items.find((entry) => entry.prefab === prefab)
  const kit: Kit = {
    id: "test",
    name: "Test",
    biome: "Meadows",
    itemGoals: [
      { prefab: "Sword" },
      { prefab: "Food3", quantity: 5 },
      { prefab: "Unknown" },
      { prefab: "Food1" },
      { prefab: "Food4" },
      { prefab: "Food2" },
    ],
  }

  it("keeps the first three foods in kit order and counts the remainder", () => {
    const result = selectVisualizerFoods(kit, getItem)
    expect(result.foods.map(({ goal }) => goal)).toEqual([
      { prefab: "Food3", quantity: 5 },
      { prefab: "Food1" },
      { prefab: "Food4" },
    ])
    expect(result.extraFoodCount).toBe(1)
  })

  it("handles missing and empty kits", () => {
    expect(selectVisualizerFoods(undefined, getItem)).toEqual({
      foods: [],
      extraFoodCount: 0,
    })
    expect(selectVisualizerFoods({ ...kit, itemGoals: [] }, getItem)).toEqual({
      foods: [],
      extraFoodCount: 0,
    })
  })
})
