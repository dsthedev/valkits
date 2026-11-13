import { describe, expect, it } from "vitest"
import {
  gameItemSchema,
  gameRecipeSchema,
  kitSchema,
  recipeRequirementSchema,
} from "./schema"

describe("game data schemas", () => {
  it("accepts item fields needed for identification and kit editing", () => {
    const item = gameItemSchema.parse({
      prefab: "ArmorBronzeChest",
      nameToken: "$item_chest_bronze",
      itemType: "Chest",
      maxStackSize: 1,
      maxQuality: 4,
    })

    expect(item.prefab).toBe("ArmorBronzeChest")
    expect(item.maxQuality).toBe(4)
  })

  it("preserves recipe ingredient recovery and per-level amounts", () => {
    const requirement = recipeRequirementSchema.parse({
      prefab: "Bronze",
      amount: 5,
      amountPerLevel: 3,
      recover: true,
    })

    expect(requirement).toMatchObject({ amountPerLevel: 3, recover: true })
  })

  it("accepts a recipe with explicit station and ingredient data", () => {
    const recipe = gameRecipeSchema.parse({
      resultPrefab: "ArmorBronzeChest",
      outputAmount: 1,
      craftingStation: "$piece_forge",
      minStationLevel: 1,
      disabled: false,
      disabledUpgrade: false,
      requireOnlyOneIngredient: false,
      requirements: [
        { prefab: "Bronze", amount: 5, amountPerLevel: 3, recover: true },
        {
          prefab: "Upgrader1Armor",
          amount: 1,
          amountPerLevel: 0,
          recover: false,
        },
      ],
      upgradeRequirements: [],
    })

    expect(recipe.requirements[1]?.prefab).toBe("Upgrader1Armor")
  })

  it("rejects negative ingredient amounts", () => {
    const result = recipeRequirementSchema.safeParse({
      prefab: "Bronze",
      amount: -1,
      amountPerLevel: 0,
      recover: true,
    })

    expect(result.success).toBe(false)
  })
})

describe("kit schema", () => {
  it("accepts a biome kit with a quality goal", () => {
    const kit = kitSchema.parse({
      id: "kit-1",
      name: "Bronze Progression",
      biome: "Black Forest",
      itemGoals: [{ prefab: "ArmorBronzeChest", targetQuality: 3 }],
    })

    expect(kit.itemGoals[0]?.targetQuality).toBe(3)
  })

  it("rejects unknown biomes and duplicate prefab goals", () => {
    const unknownBiome = kitSchema.safeParse({
      id: "kit-1",
      name: "Unknown biome",
      biome: "Unknown",
      itemGoals: [],
    })
    const duplicateGoals = kitSchema.safeParse({
      id: "kit-2",
      name: "Duplicate goals",
      biome: "Meadows",
      itemGoals: [{ prefab: "Acorn" }, { prefab: "Acorn", quantity: 2 }],
    })

    expect(unknownBiome.success).toBe(false)
    expect(duplicateGoals.success).toBe(false)
  })
})