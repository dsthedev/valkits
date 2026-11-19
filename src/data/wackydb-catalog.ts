import { z } from "zod"
import {
  gameItemSchema,
  gamePieceSchema,
  type GameProcessingConversion,
  gameRecipeSchema,
  type GameItem,
  type GamePiece,
  type GameRecipe,
} from "../domain/schema"
import {
  type ImportDiagnostic,
  type WackyDbIndex,
} from "./wackydb-index"
import { isUpgraderItemPrefab } from "../domain/upgrader-items"

const importDiagnosticSchema = z.object({
  sourcePath: z.string().min(1),
  code: z.enum([
    "invalid-item",
    "duplicate-item-prefab",
    "invalid-piece",
    "duplicate-piece-prefab",
    "invalid-recipe",
    "unresolved-recipe-result",
    "unresolved-requirement-prefab",
    "unresolved-upgrade-station",
    "unresolved-processing-input",
    "unresolved-processing-result",
  ]),
  message: z.string().min(1),
})

export const wackyDbCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal("WackyDatabase BulkYML"),
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  items: z.array(gameItemSchema),
  recipes: z.array(gameRecipeSchema),
  pieces: z.array(gamePieceSchema),
  diagnostics: z.array(importDiagnosticSchema),
})

export type WackyDbCatalog = z.infer<typeof wackyDbCatalogSchema>

export function createWackyDbCatalog(
  index: WackyDbIndex,
  sourceFingerprint: string,
): WackyDbCatalog {
  return wackyDbCatalogSchema.parse({
    schemaVersion: 1,
    source: "WackyDatabase BulkYML",
    sourceFingerprint,
    items: index.items,
    recipes: index.recipes,
    pieces: index.pieces,
    diagnostics: index.diagnostics,
  })
}

function formatCatalogErrors(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "catalog"}: ${issue.message}`)
    .join("; ")
}

export async function loadWackyDbCatalog(
  fetcher: typeof fetch = fetch,
): Promise<WackyDbCatalog> {
  const response = await fetcher("/data/wackydb/catalog.json")
  if (!response.ok) {
    throw new Error(`Unable to load WackyDatabase catalog (${response.status}).`)
  }

  const parsed = wackyDbCatalogSchema.safeParse(await response.json())
  if (!parsed.success) {
    throw new Error(`Invalid WackyDatabase catalog: ${formatCatalogErrors(parsed.error)}`)
  }

  return parsed.data
}

export function createWackyDbDataAccess(
  catalog: WackyDbCatalog,
  options: { hideUpgraderItems?: boolean } = {},
): {
  getItem(prefab: string): GameItem | undefined
  getRecipes(resultPrefab: string): readonly GameRecipe[]
  getProcessingConversions(resultPrefab: string): readonly (GameProcessingConversion & {
    stationPrefab: string
  })[]
  getPiece(prefab: string): GamePiece | undefined
  getStationPiece(stationReference: string): GamePiece | undefined
  getStationUpgrades(stationPrefab: string): readonly GamePiece[]
  searchItems(query: string): GameItem[]
  diagnostics: readonly ImportDiagnostic[]
} {
  const { hideUpgraderItems = false } = options
  const items = hideUpgraderItems
    ? catalog.items.filter((item) => !isUpgraderItemPrefab(item.prefab))
    : catalog.items
  const pieces = hideUpgraderItems
    ? catalog.pieces.map((piece) => ({
        ...piece,
        buildRequirements: piece.buildRequirements.filter(
          (requirement) => !isUpgraderItemPrefab(requirement.prefab),
        ),
        processingConversions: piece.processingConversions?.filter(
          (conversion) =>
            !isUpgraderItemPrefab(conversion.inputPrefab) &&
            !isUpgraderItemPrefab(conversion.resultPrefab),
        ),
      }))
    : catalog.pieces
  const itemsByPrefab = new Map(
    items.map((item) => [item.prefab, item] as const),
  )
  const recipesByResultPrefab = new Map<string, GameRecipe[]>()
  const piecesByPrefab = new Map(
    pieces.map((piece) => [piece.prefab, piece] as const),
  )
  const piecesByNameToken = new Map(
    pieces.map((piece) => [piece.nameToken, piece] as const),
  )
  const upgradesByStation = new Map<string, GamePiece[]>()
  const conversionsByResult = new Map<
    string,
    Array<GameProcessingConversion & { stationPrefab: string }>
  >()

  for (const piece of pieces) {
    if (!piece.upgradeStationPrefab) continue
    const upgrades = upgradesByStation.get(piece.upgradeStationPrefab) ?? []
    upgrades.push(piece)
    upgradesByStation.set(piece.upgradeStationPrefab, upgrades)
  }

  for (const recipe of catalog.recipes) {
    if (hideUpgraderItems && isUpgraderItemPrefab(recipe.resultPrefab)) {
      continue
    }

    const filteredRecipe = hideUpgraderItems
      ? {
          ...recipe,
          requirements: recipe.requirements.filter(
            (requirement) => !isUpgraderItemPrefab(requirement.prefab),
          ),
          upgradeRequirements: recipe.upgradeRequirements?.filter(
            (requirement) => !isUpgraderItemPrefab(requirement.prefab),
          ),
        }
      : recipe
    const recipes = recipesByResultPrefab.get(recipe.resultPrefab)
    if (recipes) {
      recipes.push(filteredRecipe)
    } else {
      recipesByResultPrefab.set(recipe.resultPrefab, [filteredRecipe])
    }
  }

  for (const piece of pieces) {
    for (const conversion of piece.processingConversions ?? []) {
      if (
        hideUpgraderItems &&
        (isUpgraderItemPrefab(conversion.inputPrefab) ||
          isUpgraderItemPrefab(conversion.resultPrefab))
      ) {
        continue
      }
      const conversions = conversionsByResult.get(conversion.resultPrefab) ?? []
      conversions.push({ ...conversion, stationPrefab: piece.prefab })
      conversionsByResult.set(conversion.resultPrefab, conversions)
    }
  }

  function searchItems(query: string): GameItem[] {
    const terms = normalizeSearchText(query).split(" ").filter(Boolean)
    if (terms.length === 0) return items

    return items.filter((item) => {
      const searchableText = normalizeSearchText(
        [item.prefab, item.nameToken, item.descriptionToken, item.itemType]
          .filter(Boolean)
          .join(" "),
      )

      return terms.every((term) => searchableText.includes(term))
    })
  }

  return {
    getItem: (prefab) => itemsByPrefab.get(prefab),
    getRecipes: (resultPrefab) => recipesByResultPrefab.get(resultPrefab) ?? [],
    getProcessingConversions: (resultPrefab) =>
      conversionsByResult.get(resultPrefab) ?? [],
    getPiece: (prefab) => piecesByPrefab.get(prefab),
    getStationPiece: (stationReference) =>
      piecesByPrefab.get(stationReference) ??
      piecesByNameToken.get(stationReference),
    getStationUpgrades: (stationPrefab) =>
      (upgradesByStation.get(stationPrefab) ?? []).slice().sort(
        (left, right) => (left.upgradeLevel ?? 0) - (right.upgradeLevel ?? 0),
      ),
    searchItems,
    diagnostics: catalog.diagnostics,
  }
}

function normalizeSearchText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim()
}