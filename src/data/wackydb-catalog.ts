import { z } from "zod"
import {
  gameItemSchema,
  gameRecipeSchema,
  type GameItem,
  type GameRecipe,
} from "../domain/schema"
import {
  type ImportDiagnostic,
  type WackyDbIndex,
} from "./wackydb-index"

const importDiagnosticSchema = z.object({
  sourcePath: z.string().min(1),
  code: z.enum([
    "invalid-item",
    "duplicate-item-prefab",
    "invalid-recipe",
    "unresolved-recipe-result",
    "unresolved-requirement-prefab",
  ]),
  message: z.string().min(1),
})

export const wackyDbCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal("WackyDatabase BulkYML"),
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  items: z.array(gameItemSchema),
  recipes: z.array(gameRecipeSchema),
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

export function createWackyDbDataAccess(catalog: WackyDbCatalog): {
  getItem(prefab: string): GameItem | undefined
  getRecipes(resultPrefab: string): readonly GameRecipe[]
  diagnostics: readonly ImportDiagnostic[]
} {
  const itemsByPrefab = new Map(
    catalog.items.map((item) => [item.prefab, item] as const),
  )
  const recipesByResultPrefab = new Map<string, GameRecipe[]>()

  for (const recipe of catalog.recipes) {
    const recipes = recipesByResultPrefab.get(recipe.resultPrefab)
    if (recipes) {
      recipes.push(recipe)
    } else {
      recipesByResultPrefab.set(recipe.resultPrefab, [recipe])
    }
  }

  return {
    getItem: (prefab) => itemsByPrefab.get(prefab),
    getRecipes: (resultPrefab) => recipesByResultPrefab.get(resultPrefab) ?? [],
    diagnostics: catalog.diagnostics,
  }
}