import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildWackyDbCatalog } from "../data/build-wackydb-catalog"
import { createWackyDbDataAccess } from "../data/wackydb-catalog"
import {
  gameItemSchema,
  gameRecipeSchema,
  kitSchema,
  type GameItem,
  type GameRecipe,
} from "./schema"
import {
  calculateImmediateKitRequirements,
  type ImmediateCalculationIssue,
} from "./immediate-calculation"

function item(
  prefab: string,
  itemType = "Material",
  maxStackSize = 50,
  maxQuality = 1,
): GameItem {
  return gameItemSchema.parse({
    prefab,
    nameToken: `$item_${prefab.toLowerCase()}`,
    itemType,
    maxStackSize,
    maxQuality,
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
): {
  getItem(prefab: string): GameItem | undefined
  getRecipes(resultPrefab: string): readonly GameRecipe[]
} {
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

function kit(
  itemGoals: Array<{ prefab: string; quantity?: number; targetQuality?: number }>,
) {
  return kitSchema.parse({
    id: "kit-test",
    name: "Test kit",
    biome: "Meadows",
    itemGoals,
  })
}

describe("immediate kit calculation", () => {
  it("calculates base ingredients and per-level costs from the exported bronze armor recipe", async () => {
    const sourcePath = fileURLToPath(
      new URL("../../public/data/wackydb/", import.meta.url),
    )
    const { catalog } = await buildWackyDbCatalog(sourcePath)
    const result = calculateImmediateKitRequirements(
      kit([{ prefab: "ArmorBronzeChest", targetQuality: 3 }]),
      createWackyDbDataAccess(catalog),
    )

    expect(result.requirements).toEqual([
      {
        prefab: "Bronze",
        craftAmount: 5,
        qualityAmount: 6,
        totalAmount: 11,
      },
      {
        prefab: "DeerHide",
        craftAmount: 2,
        qualityAmount: 0,
        totalAmount: 2,
      },
      {
        prefab: "Upgrader1Armor",
        craftAmount: 1,
        qualityAmount: 0,
        totalAmount: 1,
      },
    ])
    expect(result.isComplete).toBe(true)
  })

  it("rounds direct ingredient costs up to the recipe output batch", async () => {
    const sourcePath = fileURLToPath(
      new URL("../../public/data/wackydb/", import.meta.url),
    )
    const { catalog } = await buildWackyDbCatalog(sourcePath)
    const result = calculateImmediateKitRequirements(
      kit([{ prefab: "ArrowFire", quantity: 21 }]),
      createWackyDbDataAccess(catalog),
    )

    expect(result.requirements).toEqual([
      {
        prefab: "Feathers",
        craftAmount: 4,
        qualityAmount: 0,
        totalAmount: 4,
      },
      {
        prefab: "Resin",
        craftAmount: 16,
        qualityAmount: 0,
        totalAmount: 16,
      },
      {
        prefab: "Wood",
        craftAmount: 16,
        qualityAmount: 0,
        totalAmount: 16,
      },
    ])
  })

  it("aggregates the same immediate ingredient across multiple goals", () => {
    const result = calculateImmediateKitRequirements(
      kit([{ prefab: "First" }, { prefab: "Second" }]),
      dataAccess(
        [item("First"), item("Second")],
        [
          recipe("First", [
            { prefab: "Wood", amount: 2, amountPerLevel: 0, recover: true },
          ]),
          recipe("Second", [
            { prefab: "Wood", amount: 3, amountPerLevel: 0, recover: true },
          ]),
        ],
      ),
    )

    expect(result.requirements[0]?.totalAmount).toBe(5)
  })

  it("reports missing, disabled, alternative, and upgrade-only recipes", () => {
    const goals = kit([
      { prefab: "NoRecipe" },
      { prefab: "Disabled" },
      { prefab: "Alternative" },
      { prefab: "UpgradeOnly" },
    ])
    const result = calculateImmediateKitRequirements(
      goals,
      dataAccess(
        [item("NoRecipe"), item("Disabled"), item("Alternative"), item("UpgradeOnly")],
        [
          recipe("Disabled", [], { disabled: true }),
          recipe("Alternative", [], { requireOnlyOneIngredient: true }),
          recipe("UpgradeOnly", [], { noCraftOnlyUpgrade: true }),
        ],
      ),
    )
    const reasons = result.unresolved.map(({ prefab, reason }) => [prefab, reason])

    expect(reasons).toEqual([
      ["Alternative", "alternative-requirements"],
      ["Disabled", "disabled-recipe"],
      ["NoRecipe", "no-recipe"],
      ["UpgradeOnly", "upgrade-only-recipe"],
    ] satisfies Array<[string, ImmediateCalculationIssue["reason"]]>)
  })

  it("does not claim complete quality costs when the recipe marks upgrades unavailable", () => {
    const result = calculateImmediateKitRequirements(
      kit([{ prefab: "Bow", targetQuality: 2 }]),
      dataAccess(
        [item("Bow", "Bow", 1, 4)],
        [
          recipe(
            "Bow",
            [{ prefab: "Wood", amount: 10, amountPerLevel: 4, recover: true }],
            { disabledUpgrade: true },
          ),
        ],
      ),
    )

    expect(result.requirements[0]).toMatchObject({
      craftAmount: 10,
      qualityAmount: 0,
      totalAmount: 10,
    })
    expect(result.unresolved).toEqual([
      { prefab: "Bow", reason: "quality-upgrades-disabled" },
    ])
  })
})