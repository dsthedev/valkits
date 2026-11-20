import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { GameItem } from "../domain/schema"
import { kitSchema } from "../domain/schema"
import { parseItemYaml } from "./wackydb-import"

interface ExampleOption {
  id: string
  name: string
  biome: string
}

function readPublicText(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

function readPublicJson(path: string): unknown {
  return JSON.parse(readPublicText(path))
}

function readGameItem(prefab: string): GameItem {
  const sourcePath = `../../public/data/wackydb/items/Item_${prefab}.yml`
  const parsed = parseItemYaml(readPublicText(sourcePath))
  if (!parsed.success) {
    throw new Error(`${sourcePath}: ${parsed.errors.join("; ")}`)
  }
  return parsed.data
}

describe("progression example kits", () => {
  it("includes a Min Set and Max Set for every requested biome", () => {
    const catalog = readPublicJson(
      "../../public/data/examples/catalog.json"
    ) as {
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
      "../../public/data/examples/catalog.json"
    ) as { examples: ExampleOption[] }
    const itemsByPrefab = new Map<string, GameItem>()

    for (const example of examples.examples) {
      const exported = readPublicJson(
        `../../public/data/examples/${example.id}.json`
      ) as { kit: unknown }
      const kit = kitSchema.parse(exported.kit)

      expect(kit.name).toBe(example.name)
      expect(kit.biome).toBe(example.biome)
      expect(kit.description).toBeTruthy()
      const sentenceCount =
        kit.description?.match(/[.!?](?=\s|$)/g)?.length ?? 0
      expect(sentenceCount).toBeGreaterThanOrEqual(2)
      expect(sentenceCount).toBeLessThanOrEqual(3)
      for (const goal of kit.itemGoals) {
        const item =
          itemsByPrefab.get(goal.prefab) ?? readGameItem(goal.prefab)
        expect(item.prefab, `${example.id} references ${goal.prefab}`).toBe(
          goal.prefab
        )
        itemsByPrefab.set(goal.prefab, item)
        if (goal.targetQuality !== undefined) {
          expect(
            goal.targetQuality,
            `${example.id} quality for ${goal.prefab}`
          ).toBeLessThanOrEqual(item?.maxQuality ?? 1)
        }
      }
    }
  })
})
