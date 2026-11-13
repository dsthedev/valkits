import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { ImportResult } from "./wackydb-import"
import {
  linkRecipeResult,
  parseItemYaml,
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
})