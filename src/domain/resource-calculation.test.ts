import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildWackyDbCatalog } from "../data/build-wackydb-catalog"
import { createWackyDbDataAccess } from "../data/wackydb-catalog"
import {
  gameItemSchema,
  type GameProcessingConversion,
  gameRecipeSchema,
  kitSchema,
  type GameItem,
  type GameRecipe,
} from "./schema"
import { calculateKitResources, type RecipeDataAccess } from "./resource-calculation"

function item(prefab: string, itemType = "Material", maxStackSize = 50): GameItem {
  return gameItemSchema.parse({
    prefab,
    nameToken: `$item_${prefab.toLowerCase()}`,
    itemType,
    maxStackSize,
    maxQuality: 1,
  })
}

function recipe(
  resultPrefab: string,
  requirements: GameRecipe["requirements"],
  options: Partial<GameRecipe> = {},
): GameRecipe {
  return gameRecipeSchema.parse({
    resultPrefab,
    outputAmount: 1,
    requirements,
    ...options,
  })
}

function dataAccess(
  items: GameItem[],
  recipes: GameRecipe[],
): RecipeDataAccess {
  const itemsByPrefab = new Map(items.map((gameItem) => [gameItem.prefab, gameItem]))
  const recipesByResult = new Map<string, GameRecipe[]>()
  for (const gameRecipe of recipes) {
    const matching = recipesByResult.get(gameRecipe.resultPrefab) ?? []
    matching.push(gameRecipe)
    recipesByResult.set(gameRecipe.resultPrefab, matching)
  }

  return {
    getItem: (prefab) => itemsByPrefab.get(prefab),
    getRecipes: (prefab) => recipesByResult.get(prefab) ?? [],
  }
}

function kit(itemGoals: Array<{ prefab: string; quantity?: number; targetQuality?: number }>) {
  return kitSchema.parse({
    id: "kit-test",
    name: "Test kit",
    biome: "Meadows",
    itemGoals,
  })
}

describe("kit resource calculation", () => {
  it("rounds crafts up to recipe output batches using base ingredient amounts", () => {
    const result = calculateKitResources(
      kit([{ prefab: "Arrow", quantity: 21 }]),
      dataAccess(
        [item("Arrow", "Ammo"), item("Wood")],
        [
          recipe("Arrow", [
            { prefab: "Wood", amount: 8, amountPerLevel: 1, recover: true },
          ], { outputAmount: 20 }),
        ],
      ),
    )

    expect(result.leafRequirements).toEqual([{ prefab: "Wood", amount: 16 }])
    expect(result.unresolved).toEqual([
      { prefab: "Wood", amount: 16, reason: "known-item-no-recipe" },
    ])
  })

  it("recursively expands nested recipes and aggregates repeated leaves", () => {
    const result = calculateKitResources(
      kit([{ prefab: "A", quantity: 2 }]),
      dataAccess(
        [item("A"), item("B"), item("Leaf")],
        [
          recipe("A", [
            { prefab: "B", amount: 2, amountPerLevel: 0, recover: true },
          ]),
          recipe(
            "B",
            [{ prefab: "Leaf", amount: 2, amountPerLevel: 0, recover: true }],
            { outputAmount: 3 },
          ),
        ],
      ),
    )

    expect(result.leafRequirements).toEqual([{ prefab: "Leaf", amount: 4 }])
  })

  it("recursively expands base and quality ingredients", () => {
    const result = calculateKitResources(
      kit([{ prefab: "QualityGear", targetQuality: 3 }]),
      dataAccess(
        [
          gameItemSchema.parse({
            prefab: "QualityGear",
            nameToken: "$item_qualitygear",
            itemType: "Chest",
            maxQuality: 3,
            maxStackSize: 1,
          }),
          item("Bar"),
          item("Ore"),
        ],
        [
          recipe("QualityGear", [
            { prefab: "Bar", amount: 2, amountPerLevel: 2, recover: false },
          ]),
          recipe("Bar", [
            { prefab: "Ore", amount: 2, amountPerLevel: 0, recover: false },
          ]),
        ],
      ),
    )

    expect(result.directRequirements).toEqual([
      { prefab: "Bar", craftAmount: 2, qualityAmount: 4, totalAmount: 6 },
    ])
    expect(result.leafRequirements).toEqual([{ prefab: "Ore", amount: 12 }])
  })

  it("uses exported processing yield to resolve required input batches", () => {
    const baseData = dataAccess(
      [item("Mead"), item("MeadBase"), item("Honey")],
      [
        recipe("MeadBase", [
          { prefab: "Honey", amount: 3, amountPerLevel: 0, recover: false },
        ]),
      ],
    )
    const conversions: GameProcessingConversion[] = [
      {
        inputPrefab: "MeadBase",
        resultPrefab: "Mead",
        outputAmount: 6,
        removeInput: true,
      },
    ]
    const result = calculateKitResources(
      kit([{ prefab: "Mead", quantity: 5 }]),
      {
        ...baseData,
        getProcessingConversions: (prefab) =>
          conversions.filter((conversion) => conversion.resultPrefab === prefab),
      },
    )

    expect(result.leafRequirements).toEqual([{ prefab: "Honey", amount: 3 }])
    expect(result.unresolved).toEqual([
      { prefab: "Honey", amount: 3, reason: "known-item-no-recipe" },
    ])
    expect(result.isComplete).toBe(false)
  })

  it("calculates processing fuel from the rounded output batch", () => {
    const data = dataAccess([item("Processed"), item("Ore"), item("Coal")], [])
    const conversions: GameProcessingConversion[] = [
      {
        inputPrefab: "Ore",
        resultPrefab: "Processed",
        outputAmount: 2,
        removeInput: false,
        fuelPrefab: "Coal",
        fuelPerProduct: 3,
      },
    ]
    const result = calculateKitResources(
      kit([{ prefab: "Processed", quantity: 5 }]),
      {
        ...data,
        getProcessingConversions: (prefab) =>
          conversions.filter((conversion) => conversion.resultPrefab === prefab),
      },
    )

    expect(result.leafRequirements).toEqual([
      { prefab: "Coal", amount: 18 },
      { prefab: "Ore", amount: 3 },
    ])
  })

  it("uses the bronze recipe and preserves ambiguous copper processing", async () => {
    const sourcePath = fileURLToPath(
      new URL("../../public/data/wackydb/", import.meta.url),
    )
    const { catalog } = await buildWackyDbCatalog(sourcePath)
    const result = calculateKitResources(
      kit([{ prefab: "ArmorBronzeChest" }]),
      createWackyDbDataAccess(catalog),
    )

    expect(result.leafRequirements).toEqual(
      expect.arrayContaining([{ prefab: "TinOre", amount: 5 }]),
    )
    expect(result.unresolved).toContainEqual({
      prefab: "Copper",
      amount: 10,
      reason: "ambiguous-processing-conversion",
    })
    expect(result.unresolved).toContainEqual({
      prefab: "Coal",
      amount: 10,
      reason: "ambiguous-processing-conversion",
    })
  }, 15_000)

  it("reports a known item without a recipe and an unknown prefab separately", () => {
    const result = calculateKitResources(
      kit([{ prefab: "KnownLeaf" }, { prefab: "MissingPrefab", quantity: 2 }]),
      dataAccess([item("KnownLeaf")], []),
    )

    expect(result.leafRequirements).toEqual([
      { prefab: "KnownLeaf", amount: 1 },
      { prefab: "MissingPrefab", amount: 2 },
    ])
    expect(result.unresolved).toEqual([
      { prefab: "KnownLeaf", amount: 1, reason: "known-item-no-recipe" },
      { prefab: "MissingPrefab", amount: 2, reason: "unknown-prefab" },
    ])
    expect(result.isComplete).toBe(false)
  })

  it("does not use disabled recipes", () => {
    const result = calculateKitResources(
      kit([{ prefab: "DisabledItem" }]),
      dataAccess(
        [item("DisabledItem"), item("Wood")],
        [
          recipe(
            "DisabledItem",
            [{ prefab: "Wood", amount: 1, amountPerLevel: 0, recover: true }],
            { disabled: true },
          ),
        ],
      ),
    )

    expect(result.leafRequirements).toEqual([])
    expect(result.unresolved[0]?.reason).toBe("disabled-recipe")
  })

  it("reports multiple enabled recipes as ambiguous", () => {
    const result = calculateKitResources(
      kit([{ prefab: "Ambiguous" }]),
      dataAccess(
        [item("Ambiguous"), item("Wood"), item("Stone")],
        [
          recipe("Ambiguous", [
            { prefab: "Wood", amount: 1, amountPerLevel: 0, recover: true },
          ]),
          recipe("Ambiguous", [
            { prefab: "Stone", amount: 1, amountPerLevel: 0, recover: true },
          ]),
        ],
      ),
    )

    expect(result.leafRequirements).toEqual([])
    expect(result.unresolved[0]?.reason).toBe("ambiguous-recipe")
  })

  it("does not sum alternative requirements", () => {
    const result = calculateKitResources(
      kit([{ prefab: "FishCooked" }]),
      dataAccess(
        [item("FishCooked"), item("Fish1"), item("Fish2")],
        [
          recipe(
            "FishCooked",
            [
              { prefab: "Fish1", amount: 1, amountPerLevel: 0, recover: true },
              { prefab: "Fish2", amount: 1, amountPerLevel: 0, recover: true },
            ],
            { requireOnlyOneIngredient: true },
          ),
        ],
      ),
    )

    expect(result.leafRequirements).toEqual([])
    expect(result.unresolved[0]?.reason).toBe("alternative-requirements")
  })

  it("detects circular recipe dependencies", () => {
    const result = calculateKitResources(
      kit([{ prefab: "A" }]),
      dataAccess(
        [item("A"), item("B")],
        [
          recipe("A", [
            { prefab: "B", amount: 1, amountPerLevel: 0, recover: true },
          ]),
          recipe("B", [
            { prefab: "A", amount: 1, amountPerLevel: 0, recover: true },
          ]),
        ],
      ),
    )

    expect(result.unresolved).toEqual([
      { prefab: "A", amount: 1, reason: "circular-recipe" },
    ])
  })

  it("leaves quality upgrades unresolved and rejects quantities outside item capability", () => {
    const result = calculateKitResources(
      kit([
        { prefab: "QualityItem", targetQuality: 3 },
        { prefab: "SingleItem", quantity: 2 },
      ]),
      dataAccess(
        [
          gameItemSchema.parse({
            prefab: "QualityItem",
            nameToken: "$item_quality",
            itemType: "Bow",
            maxQuality: 4,
            maxStackSize: 1,
          }),
          item("SingleItem", "Misc", 1),
        ],
        [],
      ),
    )

    expect(result.unresolved).toEqual([
      { prefab: "QualityItem", amount: 1, reason: "unsupported-quality" },
      { prefab: "SingleItem", amount: 2, reason: "invalid-quantity" },
    ])
  })

  it("calculates batch requirements from the exported ArrowFire recipe", async () => {
    const sourcePath = fileURLToPath(
      new URL("../../public/data/wackydb/", import.meta.url),
    )
    const { catalog } = await buildWackyDbCatalog(sourcePath)
    const result = calculateKitResources(
      kit([{ prefab: "ArrowFire", quantity: 21 }]),
      createWackyDbDataAccess(catalog),
    )

    expect(result.leafRequirements).toEqual([
      { prefab: "Feathers", amount: 4 },
      { prefab: "Resin", amount: 16 },
      { prefab: "Wood", amount: 16 },
    ])
    expect(result.unresolved.map(({ prefab, reason }) => [prefab, reason])).toEqual([
      ["Feathers", "known-item-no-recipe"],
      ["Resin", "known-item-no-recipe"],
      ["Wood", "known-item-no-recipe"],
    ])
  }, 15_000)

  it("omits upgrader armor ingredients with the filtered catalog", async () => {
    const sourcePath = fileURLToPath(
      new URL("../../public/data/wackydb/", import.meta.url),
    )
    const { catalog } = await buildWackyDbCatalog(sourcePath)
    const result = calculateKitResources(
      kit([{ prefab: "ArmorBronzeChest" }]),
      createWackyDbDataAccess(catalog, { hideUpgraderItems: true }),
    )

    expect(
      result.leafRequirements.map((requirement) => requirement.prefab),
    ).not.toContain("Upgrader1Armor")
  }, 15_000)
})