import { describe, expect, it } from "vitest"
import { gameItemSchema } from "./schema"
import { getFoodCategory } from "./food-category"

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
      "eitr",
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
