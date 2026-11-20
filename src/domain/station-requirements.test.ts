import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildWackyDbCatalog } from "../data/build-wackydb-catalog"
import { createWackyDbDataAccess } from "../data/wackydb-catalog"
import {
  gameItemSchema,
  gamePieceSchema,
  type GameProcessingConversion,
  gameRecipeSchema,
  kitSchema,
  type GameItem,
  type GamePiece,
  type GameRecipe,
} from "./schema"
import {
  calculateKitStationRequirements,
  groupStationRequirements,
  type StationRequirementDataAccess,
} from "./station-requirements"

function item(prefab: string): GameItem {
  return gameItemSchema.parse({ prefab, nameToken: `$item_${prefab}` })
}

function recipe(
  resultPrefab: string,
  options: Partial<GameRecipe> = {},
): GameRecipe {
  return gameRecipeSchema.parse({
    resultPrefab,
    outputAmount: 1,
    requirements: [],
    ...options,
  })
}

function station(prefab: string, nameToken: string): GamePiece {
  return gamePieceSchema.parse({
    prefab,
    nameToken,
    isUpgrade: false,
    buildRequirements: [],
  })
}

function kit(
  itemGoals: Array<{
    prefab: string
    quantity?: number
    targetQuality?: number
  }>,
) {
  return kitSchema.parse({
    id: "kit-test",
    name: "Test kit",
    biome: "Meadows",
    itemGoals,
  })
}

function dataAccess(
  items: GameItem[],
  recipes: GameRecipe[],
  stations: GamePiece[] = [],
  processingConversions: Array<
    GameProcessingConversion & { stationPrefab: string }
  > = [],
): StationRequirementDataAccess {
  const itemsByPrefab = new Map(items.map((gameItem) => [gameItem.prefab, gameItem]))
  const recipesByResult = new Map<string, GameRecipe[]>()
  for (const gameRecipe of recipes) {
    const matching = recipesByResult.get(gameRecipe.resultPrefab) ?? []
    matching.push(gameRecipe)
    recipesByResult.set(gameRecipe.resultPrefab, matching)
  }
  const stationsByReference = new Map<string, GamePiece>()
  for (const gamePiece of stations) {
    stationsByReference.set(gamePiece.prefab, gamePiece)
    stationsByReference.set(gamePiece.nameToken, gamePiece)
  }

  return {
    getItem: (prefab) => itemsByPrefab.get(prefab),
    getRecipes: (prefab) => recipesByResult.get(prefab) ?? [],
    getProcessingConversions: (prefab) =>
      processingConversions.filter(
        (conversion) => conversion.resultPrefab === prefab,
      ),
    getStationPiece: (reference) => stationsByReference.get(reference),
  }
}

describe("kit station requirement calculation", () => {
  it("uses station and level values from representative current export records", async () => {
    const sourcePath = fileURLToPath(
      new URL("../../public/data/wackydb/", import.meta.url),
    )
    const { catalog } = await buildWackyDbCatalog(sourcePath)
    const data = createWackyDbDataAccess(catalog)
    const result = calculateKitStationRequirements(
      kit([{ prefab: "ArmorBronzeChest" }, { prefab: "Salad" }]),
      data,
    )

    expect(result.itemRequirements).toEqual([
      {
        itemPrefab: "ArmorBronzeChest",
        targetQuality: 1,
        status: "required",
        stationReference: "$piece_forge",
        stationPrefab: "forge",
        stationLevel: 1,
      },
      {
        itemPrefab: "Salad",
        targetQuality: 1,
        status: "required",
        stationReference: "$piece_cauldron",
        stationPrefab: "piece_cauldron",
        stationLevel: 5,
      },
    ])
  }, 15_000)

  it("finds fermenter and cauldron stations through the mead-base conversion", async () => {
    const sourcePath = fileURLToPath(
      new URL("../../public/data/wackydb/", import.meta.url),
    )
    const { catalog } = await buildWackyDbCatalog(sourcePath)
    const data = createWackyDbDataAccess(catalog)
    const result = calculateKitStationRequirements(
      kit([{ prefab: "MeadPoisonResist", quantity: 5 }]),
      data,
    )

    expect(result.itemRequirements).toEqual([
      {
        itemPrefab: "MeadPoisonResist",
        targetQuality: 1,
        stationReference: "fermenter",
        stationPrefab: "fermenter",
        outputAmountPerInput: 6,
        status: "required",
      },
      {
        itemPrefab: "MeadBasePoisonResist",
        targetQuality: 1,
        stationReference: "$piece_meadcauldron",
        stationPrefab: "piece_MeadCauldron",
        stationLevel: 1,
        status: "required",
      },
    ])
    expect(
      groupStationRequirements(result.itemRequirements).map(
        ({ stationPrefab }) => stationPrefab,
      ),
    ).toEqual(["fermenter", "piece_MeadCauldron"])
  }, 15_000)

  it("adds quality levels to the selected recipe's minimum station level", () => {
    const armor = gameItemSchema.parse({
      prefab: "Armor",
      nameToken: "$item_armor",
      itemType: "Helmet",
      maxQuality: 4,
      maxStackSize: 1,
    })
    const result = calculateKitStationRequirements(
      kit([{ prefab: "Armor", targetQuality: 3 }]),
      dataAccess(
        [armor],
        [
          recipe("Armor", {
            craftingStation: "$piece_forge",
            minStationLevel: 1,
          }),
        ],
        [station("piece_forge", "$piece_forge")],
      ),
    )

    expect(result.itemRequirements).toEqual([
      {
        itemPrefab: "Armor",
        targetQuality: 3,
        status: "required",
        stationReference: "$piece_forge",
        stationPrefab: "piece_forge",
        stationLevel: 3,
      },
    ])
  })

  it("does not infer station levels when the recipe minimum is missing", () => {
    const armor = gameItemSchema.parse({
      prefab: "Armor",
      nameToken: "$item_armor",
      itemType: "Helmet",
      maxQuality: 4,
      maxStackSize: 1,
    })
    const result = calculateKitStationRequirements(
      kit([{ prefab: "Armor", targetQuality: 4 }]),
      dataAccess(
        [armor],
        [recipe("Armor", { craftingStation: "$piece_forge" })],
        [station("piece_forge", "$piece_forge")],
      ),
    )

    expect(result.itemRequirements[0]).toMatchObject({
      itemPrefab: "Armor",
      targetQuality: 4,
      status: "unresolved",
      reason: "missing-station-level",
    })
  })

  it("requires leather hood workbench levels 3 and 4 for quality 2 and 3", async () => {
    const sourcePath = fileURLToPath(
      new URL("../../public/data/wackydb/", import.meta.url),
    )
    const { catalog } = await buildWackyDbCatalog(sourcePath)
    const data = createWackyDbDataAccess(catalog)

    for (const [targetQuality, expectedStationLevel] of [
      [2, 3],
      [3, 4],
    ]) {
      const result = calculateKitStationRequirements(
        kit([{ prefab: "HelmetLeather", targetQuality }]),
        data,
      )

      expect(result.itemRequirements[0]).toMatchObject({
        itemPrefab: "HelmetLeather",
        targetQuality,
        status: "required",
        stationReference: "$piece_workbench",
        stationPrefab: "piece_workbench",
        stationLevel: expectedStationLevel,
      })
    }
  }, 15_000)

  it("keeps invalid or disabled quality station requirements unresolved", () => {
    const qualityItem = gameItemSchema.parse({
      prefab: "QualityItem",
      nameToken: "$item_quality",
      itemType: "Helmet",
      maxQuality: 3,
      maxStackSize: 1,
    })
    const result = calculateKitStationRequirements(
      kit([
        { prefab: "QualityItem", targetQuality: 4 },
        { prefab: "LockedItem", targetQuality: 2 },
      ]),
      dataAccess(
        [qualityItem, { ...qualityItem, prefab: "LockedItem" }],
        [
          recipe("QualityItem", {
            craftingStation: "$piece_workbench",
            minStationLevel: 2,
          }),
          recipe("LockedItem", {
            craftingStation: "$piece_workbench",
            minStationLevel: 2,
            disabledUpgrade: true,
          }),
        ],
        [station("piece_workbench", "$piece_workbench")],
      ),
    )

    expect(result.itemRequirements).toMatchObject([
      { itemPrefab: "QualityItem", status: "unresolved", reason: "invalid-target-quality" },
      { itemPrefab: "LockedItem", status: "unresolved", reason: "quality-upgrades-disabled" },
    ])
  })

  it("groups shared stations using the highest minimum level and retains item details", () => {
    const result = calculateKitStationRequirements(
      kit([{ prefab: "Armor" }, { prefab: "Sword" }, { prefab: "Food" }]),
      dataAccess(
        [item("Armor"), item("Sword"), item("Food")],
        [
          recipe("Armor", {
            craftingStation: "$piece_forge",
            minStationLevel: 1,
          }),
          recipe("Sword", {
            craftingStation: "$piece_forge",
            minStationLevel: 3,
          }),
          recipe("Food", {
            craftingStation: "$piece_cauldron",
            minStationLevel: 2,
          }),
        ],
        [
          station("piece_forge", "$piece_forge"),
          station("piece_cauldron", "$piece_cauldron"),
        ],
      ),
    )

    expect(groupStationRequirements(result.itemRequirements)).toEqual([
      {
        stationPrefab: "piece_cauldron",
        stationLevel: 2,
        itemRequirements: [
          expect.objectContaining({ itemPrefab: "Food", stationLevel: 2 }),
        ],
      },
      {
        stationPrefab: "piece_forge",
        stationLevel: 3,
        itemRequirements: [
          expect.objectContaining({ itemPrefab: "Armor", stationLevel: 1 }),
          expect.objectContaining({ itemPrefab: "Sword", stationLevel: 3 }),
        ],
      },
    ])
  })

  it("reports recipes without a station as not listed rather than inferring one", () => {
    const result = calculateKitStationRequirements(
      kit([{ prefab: "Food" }]),
      dataAccess([item("Food")], [recipe("Food")]),
    )

    expect(result.itemRequirements[0]).toMatchObject({
      itemPrefab: "Food",
      status: "no-station-listed",
    })
  })

  it("keeps recipe selection failures and unresolved stations explicit", () => {
    const result = calculateKitStationRequirements(
      kit([
        { prefab: "Unknown" },
        { prefab: "NoRecipe" },
        { prefab: "Disabled" },
        { prefab: "Ambiguous" },
        { prefab: "UnknownStation" },
      ]),
      dataAccess(
        [item("NoRecipe"), item("Disabled"), item("Ambiguous"), item("UnknownStation")],
        [
          recipe("Disabled", { disabled: true }),
          recipe("Ambiguous", { craftingStation: "$piece_forge" }),
          recipe("Ambiguous", { craftingStation: "$piece_cauldron" }),
          recipe("UnknownStation", {
            craftingStation: "$piece_missing",
            minStationLevel: 2,
          }),
        ],
      ),
    )

    expect(
      result.itemRequirements.map((requirement) =>
        requirement.status === "unresolved" ? requirement.reason : undefined,
      ),
    ).toEqual([
      "unknown-item",
      "no-recipe",
      "disabled-recipe",
      "ambiguous-recipe",
      "unresolved-station",
    ])
    expect(result.itemRequirements[4]).toMatchObject({
      stationReference: "$piece_missing",
      stationLevel: 2,
      status: "unresolved",
    })
  })

  it("detects cycles in processing conversions", () => {
    const conversions = [
      {
        inputPrefab: "B",
        resultPrefab: "A",
        outputAmount: 1,
        removeInput: true,
        stationPrefab: "fermenter",
      },
      {
        inputPrefab: "A",
        resultPrefab: "B",
        outputAmount: 1,
        removeInput: true,
        stationPrefab: "fermenter",
      },
    ]
    const result = calculateKitStationRequirements(
      kit([{ prefab: "A" }]),
      dataAccess(
        [item("A"), item("B")],
        [],
        [station("fermenter", "$piece_fermenter")],
        conversions,
      ),
    )

    expect(result.itemRequirements.at(-1)).toMatchObject({
      itemPrefab: "A",
      status: "unresolved",
      reason: "processing-cycle",
    })
  })
})
