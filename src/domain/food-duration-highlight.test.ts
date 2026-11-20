import { describe, expect, it } from "vitest"
import { getLongestFoodDurationSeconds } from "./food-duration-highlight"
import type { GameItem } from "./schema"

const raspberry: GameItem = {
  prefab: "Raspberry",
  nameToken: "$item_raspberries",
  foodStats: { durationSeconds: 600 },
}

const carrot: GameItem = {
  prefab: "Carrot",
  nameToken: "$item_carrot",
  foodStats: { durationSeconds: 600 },
}

describe("food duration highlight", () => {
  it("returns the only food duration", () => {
    expect(getLongestFoodDurationSeconds([raspberry])).toBe(600)
  })

  it("returns the longest duration, including when multiple foods tie", () => {
    expect(
      getLongestFoodDurationSeconds([
        raspberry,
        { ...carrot, foodStats: { durationSeconds: 900 } },
      ]),
    ).toBe(900)
    expect(getLongestFoodDurationSeconds([raspberry, carrot])).toBe(600)
  })

  it("ignores foods without a known positive duration", () => {
    expect(
      getLongestFoodDurationSeconds([
        raspberry,
        { ...carrot, foodStats: { health: 10 } },
      ]),
    ).toBe(600)
    expect(
      getLongestFoodDurationSeconds([
        { ...carrot, foodStats: { durationSeconds: 0 } },
      ]),
    ).toBeNull()
  })
})