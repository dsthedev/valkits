import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  buildWackyDbCatalog,
  fingerprintWackyDbSourceFiles,
  readWackyDbSourceFiles,
} from "./build-wackydb-catalog"
import { createWackyDbDataAccess } from "./wackydb-catalog"
import { indexWackyDbFiles } from "./wackydb-index"

describe("WackyDatabase index", () => {
  it("indexes the full current export with stable diagnostics and lookup", async () => {
    const sourcePath = fileURLToPath(
      new URL("../../public/data/wackydb/", import.meta.url),
    )
    const sourceFiles = await readWackyDbSourceFiles(sourcePath)
    const firstFingerprint = fingerprintWackyDbSourceFiles([
      ...sourceFiles.items,
      ...sourceFiles.recipes,
    ])
    const secondFingerprint = fingerprintWackyDbSourceFiles([
      ...sourceFiles.recipes,
      ...sourceFiles.items,
    ])
    const { catalog, itemCount, recipeCount } =
      await buildWackyDbCatalog(sourcePath)
    const dataAccess = createWackyDbDataAccess(catalog)

    expect(sourceFiles.items.length).toBeGreaterThan(1000)
    expect(sourceFiles.recipes.length).toBeGreaterThan(400)
    expect(itemCount).toBeGreaterThan(1000)
    expect(recipeCount).toBeGreaterThan(300)
    expect(firstFingerprint).toBe(secondFingerprint)
    expect(catalog.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(dataAccess.getItem("ArmorBronzeChest")?.nameToken).toBe(
      "$item_chest_bronze",
    )
    expect(
      dataAccess.searchItems("bronze chest").map((item) => item.prefab),
    ).toContain("ArmorBronzeChest")
    expect(dataAccess.searchItems("no-such-prefab")).toHaveLength(0)
    expect(
      dataAccess
        .getRecipes("ArmorBronzeChest")[0]
        ?.requirements.some((requirement) => requirement.prefab === "Upgrader1Armor"),
    ).toBe(true)
    expect(catalog.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unresolved-recipe-result",
          sourcePath: "recipes/Recipe_Recipe_Fish1.yml",
        }),
      ]),
    )
  })

  it("reports duplicate item prefabs and keeps the first file deterministically", () => {
    const index = indexWackyDbFiles(
      [
        {
          path: "items/a.yml",
          contents: "name: Acorn\nm_name: $item_oakseeds\n",
        },
        {
          path: "items/b.yml",
          contents: "name: Acorn\nm_name: $item_duplicate\n",
        },
      ],
      [],
    )

    expect(index.items).toHaveLength(1)
    expect(index.items[0]?.nameToken).toBe("$item_oakseeds")
    expect(index.diagnostics[0]?.code).toBe("duplicate-item-prefab")
  })
})