import { describe, expect, it } from "vitest"
import { estimateChestStorage } from "./chest-estimate"
import { gameItemSchema, gamePieceSchema } from "./schema"

const chest = gamePieceSchema.parse({
  prefab: "piece_chest",
  nameToken: "$piece_chest",
  isUpgrade: false,
  containerSize: { Width: 2, Height: 2 },
  buildRequirements: [
    { prefab: "FineWood", amount: 10, amountPerLevel: 1, recover: true },
    { prefab: "Iron", amount: 2, amountPerLevel: 1, recover: true },
  ],
})
const items = new Map([
  ["Blueberries", gameItemSchema.parse({ prefab: "Blueberries", nameToken: "berries", maxStackSize: 50 })],
  ["Wood", gameItemSchema.parse({ prefab: "Wood", nameToken: "wood", maxStackSize: 50 })],
])
const getItem = (prefab: string) => items.get(prefab)

describe("chest storage estimates", () => {
  it("rounds each resource to stacks and multiplies direct chest costs", () => {
    expect(estimateChestStorage([
      { prefab: "Blueberries", amount: 50 },
      { prefab: "Wood", amount: 151 },
    ], chest, getItem)).toEqual({
      slots: 5,
      capacity: 4,
      count: 2,
      costs: [{ prefab: "FineWood", amount: 20 }, { prefab: "Iron", amount: 4 }],
      missingStackSizes: [],
    })
  })

  it("reports missing stack sizes and supports empty resources", () => {
    expect(estimateChestStorage([{ prefab: "Unknown", amount: 1 }], chest, getItem)).toMatchObject({
      count: 0,
      missingStackSizes: ["Unknown"],
    })
    expect(estimateChestStorage([], chest, getItem)).toMatchObject({ count: 0, missingStackSizes: [] })
    expect(estimateChestStorage([], undefined, getItem)).toBeUndefined()
  })
})