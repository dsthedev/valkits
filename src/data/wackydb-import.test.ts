import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { ImportResult } from "./wackydb-import"
import {
  linkRecipeResult,
  parseItemYaml,
  parsePieceYaml,
  parseRecipeYaml,
} from "./wackydb-import"

function readSourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

function getData<T>(result: ImportResult<T>): T {
  if (!result.success) throw new Error(result.errors.join("; "))
  return result.data
}

describe("WackyDatabase YAML import", () => {
  it("normalizes an exported item using only kit-relevant fields", () => {
    const item = getData(
      parseItemYaml(
        readSourceFile("../../public/data/wackydb/items/Item_ArmorBronzeChest.yml"),
      ),
    )

    expect(item).toMatchObject({
      prefab: "ArmorBronzeChest",
      nameToken: "$item_chest_bronze",
      itemType: "Chest",
      maxStackSize: 1,
      maxQuality: 4,
    })
  })


  it("links a recipe to an item only by an exact prefab match", () => {
    const item = getData(
      parseItemYaml(
        readSourceFile("../../public/data/wackydb/items/Item_ArmorBronzeChest.yml"),
      ),
    )
    const candidate = getData(
      parseRecipeYaml(
        readSourceFile(
          "../../public/data/wackydb/recipes/Recipe_ArmorBronzeChest.yml",
        ),
      ),
    )
    const recipe = getData(
      linkRecipeResult(candidate, new Map([[item.prefab, item]])),
    )

    expect(recipe).toMatchObject({
      resultPrefab: "ArmorBronzeChest",
      outputAmount: 1,
      craftingStation: "$piece_forge",
      noCraftOnlyUpgrade: false,
      requirements: [
        { prefab: "Bronze", amount: 5, amountPerLevel: 3, recover: true },
        {
          prefab: "DeerHide",
          amount: 2,
          amountPerLevel: 0,
          recover: true,
        },
        {
          prefab: "Upgrader1Armor",
          amount: 1,
          amountPerLevel: 0,
          recover: false,
        },
      ],
    })
  })

  it("links the verified Black Soup source name to its item prefab", () => {
    const item = getData(
      parseItemYaml(
        readSourceFile("../../public/data/wackydb/items/Item_BlackSoup.yml"),
      ),
    )
    const candidate = getData(
      parseRecipeYaml(
        readSourceFile(
          "../../public/data/wackydb/recipes/Recipe_Recipe_Blacksoup.yml",
        ),
      ),
    )
    const recipe = getData(
      linkRecipeResult(candidate, new Map([[item.prefab, item]])),
    )

    expect(recipe).toMatchObject({
      resultPrefab: "BlackSoup",
      craftingStation: "$piece_cauldron",
      minStationLevel: 2,
    })
  })

  it("preserves alternative-recipe metadata without guessing its result", () => {
    const candidate = getData(
      parseRecipeYaml(
        readSourceFile("../../public/data/wackydb/recipes/Recipe_Recipe_Fish1.yml"),
      ),
    )
    const fishItem = getData(
      parseItemYaml(readSourceFile("../../public/data/wackydb/items/Item_Fish1.yml")),
    )
    const unresolved = linkRecipeResult(
      candidate,
      new Map([[fishItem.prefab, fishItem]]),
    )

    expect(candidate.requireOnlyOneIngredient).toBe(true)
    expect(candidate.requirements).toHaveLength(12)
    expect(unresolved.success).toBe(false)
  })

  it("parses requirement prefabs containing colons and rejects malformed rows", () => {
    const candidateYaml = `name: Example
amount: 1
reqs:
  - Wood:variant:2:0:True
`
    const malformedYaml = `name: Example
amount: 1
reqs:
  - Wood:two:True
`
    const candidate = getData(parseRecipeYaml(candidateYaml))
    const malformed = parseRecipeYaml(malformedYaml)

    expect(candidate.requirements[0]?.prefab).toBe("Wood:variant")
    expect(malformed.success).toBe(false)
  })

  it("preserves recipes marked as upgrade-only", () => {
    const candidate = getData(
      parseRecipeYaml(`name: Recipe_SwordGold
amount: 1
m_noCraftOnlyUpgrade: true
reqs: []
`),
    )

    expect(candidate.noCraftOnlyUpgrade).toBe(true)
  })

  it("normalizes workbench upgrade order and construction requirements", () => {
    const piece = getData(
      parsePieceYaml(
        readSourceFile(
          "../../public/data/wackydb/pieces/Piece_piece_workbench_ext2.yml",
        ),
      ),
    )

    expect(piece).toMatchObject({
      prefab: "piece_workbench_ext2",
      nameToken: "$piece_workbench_ext2",
      craftingStation: "$piece_workbench",
      isUpgrade: true,
      upgradeStationPrefab: "piece_workbench",
      upgradeLevel: 3,
      buildRequirements: [
        { prefab: "Wood", amount: 10, amountPerLevel: 1, recover: true },
        { prefab: "Flint", amount: 15, amountPerLevel: 1, recover: true },
        { prefab: "LeatherScraps", amount: 20, amountPerLevel: 1, recover: true },
        { prefab: "DeerHide", amount: 5, amountPerLevel: 1, recover: true },
      ],
    })
  })

  it("imports fermenter conversions with their input, output, and yield", () => {
    const piece = getData(
      parsePieceYaml(
        readSourceFile("../../public/data/wackydb/pieces/Piece_fermenter.yml"),
      ),
    )

    expect(piece.processingConversions).toContainEqual({
      inputPrefab: "MeadBasePoisonResist",
      resultPrefab: "MeadPoisonResist",
      outputAmount: 6,
      removeInput: false,
    })
  })

  it("imports smelter conversions with their fuel requirement", () => {
    const piece = getData(
      parsePieceYaml(
        readSourceFile("../../public/data/wackydb/pieces/Piece_smelter.yml"),
      ),
    )

    expect(piece.processingConversions).toContainEqual({
      inputPrefab: "CopperOre",
      resultPrefab: "Copper",
      outputAmount: 1,
      removeInput: false,
      fuelPrefab: "Coal",
      fuelPerProduct: 2,
    })
    expect(piece.processingConversions).toContainEqual({
      inputPrefab: "TinOre",
      resultPrefab: "Tin",
      outputAmount: 1,
      removeInput: false,
      fuelPrefab: "Coal",
      fuelPerProduct: 2,
    })
  })

  it("maps the cauldron spice rack to verified upgrade level 2", () => {
    const piece = getData(
      parsePieceYaml(
        readSourceFile(
          "../../public/data/wackydb/pieces/Piece_cauldron_ext1_spice.yml",
        ),
      ),
    )

    expect(piece).toMatchObject({
      prefab: "cauldron_ext1_spice",
      isUpgrade: true,
      upgradeStationPrefab: "piece_cauldron",
      upgradeLevel: 2,
    })
  })

  it("maps the compound cauldron butcher table to its verified level", () => {
    const piece = getData(
      parsePieceYaml(
        readSourceFile(
          "../../public/data/wackydb/pieces/Piece_cauldron_ext3_butchertable.yml",
        ),
      ),
    )

    expect(piece.upgradeLevel).toBe(3)
  })
})