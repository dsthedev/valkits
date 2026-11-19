import { describe, expect, it } from "vitest"
import {
  gameItemSchema,
  gamePieceSchema,
  gameRecipeSchema,
  type GameItem,
  type GamePiece,
  type GameRecipe,
} from "./schema"
import type { ItemStationRequirement } from "./station-requirements"
import {
  calculateStationResources,
  type StationResourceDataAccess,
} from "./station-resource-calculation"

function piece(
  prefab: string,
  requirements: Array<{ prefab: string; amount: number }>,
  options: Partial<GamePiece> = {},
): GamePiece {
  return gamePieceSchema.parse({
    prefab,
    nameToken: `$piece_${prefab}`,
    isUpgrade: false,
    buildRequirements: requirements.map((requirement) => ({
      ...requirement,
      amountPerLevel: 0,
      recover: true,
    })),
    ...options,
  })
}

function requirement(
  itemPrefab: string,
  stationPrefab: string,
  stationLevel: number,
): ItemStationRequirement {
  return {
    itemPrefab,
    targetQuality: 1,
    status: "required",
    stationReference: `$piece_${stationPrefab}`,
    stationPrefab,
    stationLevel,
  }
}

function dataAccess(
  pieces: GamePiece[],
  items: GameItem[] = [],
  recipes: GameRecipe[] = [],
): StationResourceDataAccess {
  const piecesByPrefab = new Map(pieces.map((entry) => [entry.prefab, entry]))
  const itemsByPrefab = new Map(items.map((entry) => [entry.prefab, entry]))
  const recipesByResult = new Map<string, GameRecipe[]>()
  for (const recipe of recipes) {
    const matching = recipesByResult.get(recipe.resultPrefab) ?? []
    matching.push(recipe)
    recipesByResult.set(recipe.resultPrefab, matching)
  }

  return {
    getItem: (prefab) => itemsByPrefab.get(prefab),
    getRecipes: (prefab) => recipesByResult.get(prefab) ?? [],
    getStationPiece: (reference) =>
      piecesByPrefab.get(reference) ??
      piecesByPrefab.get(reference.replace(/^\$piece_/, "")),
    getStationUpgrades: (stationPrefab) =>
      pieces
        .filter((entry) => entry.upgradeStationPrefab === stationPrefab)
        .sort(
          (left, right) =>
            (left.upgradeLevel ?? 0) - (right.upgradeLevel ?? 0),
        ),
  }
}

describe("station resource calculation", () => {
  it("includes the base station and every upgrade through the highest requested level", () => {
    const result = calculateStationResources(
      [
        requirement("ItemA", "forge", 1),
        requirement("ItemB", "forge", 3),
      ],
      dataAccess([
        piece("forge", [{ prefab: "Wood", amount: 2 }]),
        piece(
          "forge_ext1",
          [{ prefab: "Stone", amount: 3 }],
          {
            isUpgrade: true,
            upgradeStationPrefab: "forge",
            upgradeLevel: 2,
          },
        ),
        piece(
          "forge_ext2",
          [{ prefab: "Copper", amount: 4 }],
          {
            isUpgrade: true,
            upgradeStationPrefab: "forge",
            upgradeLevel: 3,
          },
        ),
      ]),
    )

    expect(result.stationResources).toEqual([
      { prefab: "Copper", amount: 4 },
      { prefab: "Stone", amount: 3 },
      { prefab: "Wood", amount: 2 },
    ])
    expect(result.unresolvedStations).toEqual([])
  })

  it("reports missing upgrade levels instead of assuming their costs", () => {
    const result = calculateStationResources(
      [requirement("ItemA", "forge", 3)],
      dataAccess([
        piece("forge", [{ prefab: "Wood", amount: 2 }]),
        piece(
          "forge_ext2",
          [{ prefab: "Copper", amount: 4 }],
          {
            isUpgrade: true,
            upgradeStationPrefab: "forge",
            upgradeLevel: 3,
          },
        ),
      ]),
    )

    expect(result.stationResources).toEqual([
      { prefab: "Copper", amount: 4 },
      { prefab: "Wood", amount: 2 },
    ])
    expect(result.unresolvedStations).toEqual([
      {
        stationPrefab: "forge",
        level: 2,
        reason: "missing-station-upgrade",
      },
    ])
    expect(result.isComplete).toBe(false)
  })

  it("reports upgrades with unverified levels instead of guessing their order", () => {
    const result = calculateStationResources(
      [requirement("ItemA", "cauldron", 2)],
      dataAccess([
        piece("cauldron", [{ prefab: "Tin", amount: 10 }]),
        piece(
          "cauldron_ext1_spice",
          [{ prefab: "Dandelion", amount: 3 }],
          {
            isUpgrade: true,
            upgradeStationPrefab: "cauldron",
          },
        ),
      ]),
    )

    expect(result.stationResources).toEqual([
      { prefab: "Tin", amount: 10 },
    ])
    expect(result.unresolvedStations).toEqual([
      {
        stationPrefab: "cauldron",
        level: 2,
        reason: "unmapped-station-upgrade",
      },
    ])
    expect(result.isComplete).toBe(false)
  })

  it("recursively resolves recipes for station construction materials", () => {
    const result = calculateStationResources(
      [requirement("ItemA", "forge", 1)],
      dataAccess(
        [piece("forge", [{ prefab: "RefinedMaterial", amount: 3 }])],
        [
          gameItemSchema.parse({
            prefab: "RefinedMaterial",
            nameToken: "$item_refined",
            maxStackSize: 50,
            maxQuality: 1,
          }),
          gameItemSchema.parse({
            prefab: "Wood",
            nameToken: "$item_wood",
            maxStackSize: 50,
            maxQuality: 1,
          }),
        ],
        [
          gameRecipeSchema.parse({
            resultPrefab: "RefinedMaterial",
            outputAmount: 2,
            requirements: [
              {
                prefab: "Wood",
                amount: 4,
                amountPerLevel: 0,
                recover: true,
              },
            ],
          }),
        ],
      ),
    )

    expect(result.stationResources).toEqual([{ prefab: "Wood", amount: 8 }])
    expect(result.unresolvedResources).toEqual([
      { prefab: "Wood", amount: 8, reason: "known-item-no-recipe" },
    ])
  })
})
