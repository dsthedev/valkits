import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  buildWackyDbCatalog,
  fingerprintWackyDbSourceFiles,
  readWackyDbSourceFiles,
} from "./build-wackydb-catalog"
import { createWackyDbDataAccess } from "./wackydb-catalog"
import { indexWackyDbFiles } from "./wackydb-index"
import { getItemGoalCapabilities } from "../domain/item-goal-capabilities"
import { stationUpgradePaths } from "../domain/station-upgrade-paths"

describe("WackyDatabase index", () => {
  it("indexes the full current export with stable diagnostics and lookup", async () => {
    const sourcePath = fileURLToPath(
      new URL("../../public/data/wackydb/", import.meta.url),
    )
    const sourceFiles = await readWackyDbSourceFiles(sourcePath)
    const firstFingerprint = fingerprintWackyDbSourceFiles([
      ...sourceFiles.items,
      ...sourceFiles.recipes,
      ...sourceFiles.pieces,
    ])
    const secondFingerprint = fingerprintWackyDbSourceFiles([
      ...sourceFiles.recipes,
      ...sourceFiles.pieces,
      ...sourceFiles.items,
    ])
    const { catalog, itemCount, recipeCount, pieceCount } =
      await buildWackyDbCatalog(sourcePath)
    const dataAccess = createWackyDbDataAccess(catalog)

    expect(sourceFiles.items.length).toBeGreaterThan(1000)
    expect(sourceFiles.recipes.length).toBeGreaterThan(400)
    expect(sourceFiles.pieces.length).toBeGreaterThan(300)
    expect(itemCount).toBeGreaterThan(1000)
    expect(recipeCount).toBeGreaterThan(300)
    expect(pieceCount).toBeGreaterThan(300)
    expect(firstFingerprint).toBe(secondFingerprint)
    expect(catalog.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(dataAccess.getItem("ArmorBronzeChest")?.nameToken).toBe(
      "$item_chest_bronze",
    )
    expect(dataAccess.getStationPiece("$piece_workbench")?.prefab).toBe(
      "piece_workbench",
    )
    expect(
      dataAccess
        .getStationUpgrades("piece_workbench")
        .map((piece) => piece.upgradeLevel),
    ).toEqual([2, 3, 4, 5])
    expect(
      dataAccess
        .getStationUpgrades("piece_cauldron")
        .find((piece) => piece.prefab === "cauldron_ext1_spice")
        ?.upgradeLevel,
    ).toBe(2)
    for (const [stationPrefab, stationPath] of Object.entries(stationUpgradePaths)) {
      for (const upgrade of stationPath.upgrades) {
        expect(dataAccess.getPiece(upgrade.prefab)).toMatchObject({
          prefab: upgrade.prefab,
          isUpgrade: true,
          upgradeStationPrefab: stationPrefab,
          upgradeLevel: upgrade.level,
        })
      }
    }
    expect(dataAccess.getRecipes("BlackSoup")).toContainEqual(
      expect.objectContaining({
        craftingStation: "$piece_cauldron",
        minStationLevel: 2,
      }),
    )
    expect(
      getItemGoalCapabilities(dataAccess.getItem("ArmorBronzeChest")!),
    ).toEqual({ quantity: false, maxQuality: 4 })
    expect(
      getItemGoalCapabilities(dataAccess.getItem("ArrowIron")!),
    ).toEqual({ quantity: true, maxQuality: null })
    expect(
      dataAccess.searchItems("bronze chest").map((item) => item.prefab),
    ).toContain("ArmorBronzeChest")
    expect(dataAccess.searchItems("no-such-prefab")).toHaveLength(0)
    expect(
      dataAccess
        .getRecipes("ArmorBronzeChest")[0]
        ?.requirements.some((requirement) => requirement.prefab === "Upgrader1Armor"),
    ).toBe(true)

    const dataAccessWithoutUpgraders = createWackyDbDataAccess(catalog, {
      hideUpgraderItems: true,
    })
    expect(dataAccessWithoutUpgraders.getItem("Upgrader1Armor")).toBeUndefined()
    expect(dataAccessWithoutUpgraders.searchItems("Upgrader1Armor")).toEqual([])
    expect(
      dataAccessWithoutUpgraders
        .getRecipes("ArmorBronzeChest")[0]
        ?.requirements.some((requirement) => requirement.prefab === "Upgrader1Armor"),
    ).toBe(false)
    expect(catalog.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unresolved-recipe-result",
          sourcePath: "recipes/Recipe_Recipe_Fish1.yml",
        }),
      ]),
    )
  }, 15_000)

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