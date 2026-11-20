import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { GameItem } from "../domain/schema"
import { kitSchema } from "../domain/schema"

interface ExampleOption {
  id: string
  name: string
  biome: string
}

function readPublicJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"))
}

describe("progression example kits", () => {
  it("includes a Min Set and Max Set for every requested biome", () => {
    const catalog = readPublicJson("../../public/data/examples/catalog.json") as {
      examples: ExampleOption[]
    }
    const expectedBiomes = [
      "Meadows",
      "Black Forest",
      "Swamp",
      "Mountain",
      "Plains",
      "Mistlands",
      "Ashlands",
    ]

    expect(catalog.examples).toHaveLength(expectedBiomes.length * 2)
    for (const biome of expectedBiomes) {
      expect(catalog.examples).toContainEqual({
        id: `${biome.toLowerCase().replaceAll(" ", "-")}-min-set`,
        name: `${biome} Min Set`,
        biome,
      })
      expect(catalog.examples).toContainEqual({
        id: `${biome.toLowerCase().replaceAll(" ", "-")}-max-set`,
        name: `${biome} Max Set`,
        biome,
      })
    }
  })

  it("uses known prefabs and valid quality targets in every example", () => {
    const examples = readPublicJson(
      "../../public/data/examples/catalog.json",
    ) as { examples: ExampleOption[] }
    const itemCatalog = readPublicJson(
      "../../public/data/wackydb/catalog.json",
    ) as { items: GameItem[] }
    const itemsByPrefab = new Map(
      itemCatalog.items.map((item) => [item.prefab, item]),
    )

    for (const example of examples.examples) {
      const exported = readPublicJson(
        `../../public/data/examples/${example.id}.json`,
      ) as { kit: unknown }
      const kit = kitSchema.parse(exported.kit)

      expect(kit.name).toBe(example.name)
      expect(kit.biome).toBe(example.biome)
      for (const goal of kit.itemGoals) {
        const item = itemsByPrefab.get(goal.prefab)
        expect(item, `${example.id} references ${goal.prefab}`).toBeDefined()
        if (goal.targetQuality !== undefined) {
          expect(
            goal.targetQuality,
            `${example.id} quality for ${goal.prefab}`,
          ).toBeLessThanOrEqual(item?.maxQuality ?? 1)
        }
      }
    }
  })
})