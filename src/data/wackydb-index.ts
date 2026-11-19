import type { GameItem, GamePiece, GameRecipe } from "../domain/schema"
import {
  linkRecipeResult,
  parseItemYaml,
  parsePieceYaml,
  parseRecipeYaml,
  type RecipeCandidate,
} from "./wackydb-import"

export type ImportDiagnosticCode =
  | "invalid-item"
  | "duplicate-item-prefab"
  | "invalid-piece"
  | "duplicate-piece-prefab"
  | "invalid-recipe"
  | "unresolved-recipe-result"
  | "unresolved-requirement-prefab"
  | "unresolved-upgrade-station"
  | "unresolved-processing-input"
  | "unresolved-processing-result"

export interface ImportDiagnostic {
  sourcePath: string
  code: ImportDiagnosticCode
  message: string
}

export interface YamlSourceFile {
  path: string
  contents: string
}

export interface WackyDbIndex {
  items: GameItem[]
  recipes: GameRecipe[]
  pieces: GamePiece[]
  diagnostics: ImportDiagnostic[]
  itemsByPrefab: Map<string, GameItem>
  recipesByResultPrefab: Map<string, GameRecipe[]>
  piecesByPrefab: Map<string, GamePiece>
}

interface RecipeCandidateFile {
  path: string
  candidate: RecipeCandidate
}

function sortByPath(files: readonly YamlSourceFile[]): YamlSourceFile[] {
  return [...files].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  )
}

function addDiagnostic(
  diagnostics: ImportDiagnostic[],
  sourcePath: string,
  code: ImportDiagnosticCode,
  message: string,
): void {
  diagnostics.push({ sourcePath, code, message })
}

export function indexWackyDbFiles(
  itemFiles: readonly YamlSourceFile[],
  recipeFiles: readonly YamlSourceFile[],
  pieceFiles: readonly YamlSourceFile[] = [],
): WackyDbIndex {
  const diagnostics: ImportDiagnostic[] = []
  const itemsByPrefab = new Map<string, GameItem>()

  for (const file of sortByPath(itemFiles)) {
    const result = parseItemYaml(file.contents)
    if (!result.success) {
      addDiagnostic(
        diagnostics,
        file.path,
        "invalid-item",
        result.errors.join("; "),
      )
      continue
    }

    if (itemsByPrefab.has(result.data.prefab)) {
      addDiagnostic(
        diagnostics,
        file.path,
        "duplicate-item-prefab",
        `Duplicate item prefab "${result.data.prefab}"; kept the first record.`,
      )
      continue
    }

    itemsByPrefab.set(result.data.prefab, result.data)
  }

  const recipeCandidates: RecipeCandidateFile[] = []
  for (const file of sortByPath(recipeFiles)) {
    const result = parseRecipeYaml(file.contents)
    if (!result.success) {
      addDiagnostic(
        diagnostics,
        file.path,
        "invalid-recipe",
        result.errors.join("; "),
      )
      continue
    }

    recipeCandidates.push({ path: file.path, candidate: result.data })
  }

  const piecesByPrefab = new Map<string, GamePiece>()
  for (const file of sortByPath(pieceFiles)) {
    const result = parsePieceYaml(file.contents)
    if (!result.success) {
      addDiagnostic(
        diagnostics,
        file.path,
        "invalid-piece",
        result.errors.join("; "),
      )
      continue
    }

    if (piecesByPrefab.has(result.data.prefab)) {
      addDiagnostic(
        diagnostics,
        file.path,
        "duplicate-piece-prefab",
        `Duplicate piece prefab "${result.data.prefab}"; kept the first record.`,
      )
      continue
    }

    piecesByPrefab.set(result.data.prefab, result.data)
  }

  const recipes: GameRecipe[] = []
  const recipesByResultPrefab = new Map<string, GameRecipe[]>()

  for (const { path, candidate } of recipeCandidates) {
    const result = linkRecipeResult(candidate, itemsByPrefab)
    if (!result.success) {
      addDiagnostic(
        diagnostics,
        path,
        "unresolved-recipe-result",
        result.errors.join("; "),
      )
      continue
    }

    recipes.push(result.data)
    const matchingRecipes = recipesByResultPrefab.get(result.data.resultPrefab)
    if (matchingRecipes) {
      matchingRecipes.push(result.data)
    } else {
      recipesByResultPrefab.set(result.data.resultPrefab, [result.data])
    }

    for (const requirement of [
      ...result.data.requirements,
      ...(result.data.upgradeRequirements ?? []),
    ]) {
      if (!itemsByPrefab.has(requirement.prefab)) {
        addDiagnostic(
          diagnostics,
          path,
          "unresolved-requirement-prefab",
          `Requirement prefab "${requirement.prefab}" is not in the item index.`,
        )
      }
    }
  }

  for (const piece of piecesByPrefab.values()) {
    if (
      piece.upgradeStationPrefab &&
      !piecesByPrefab.has(piece.upgradeStationPrefab)
    ) {
      addDiagnostic(
        diagnostics,
        `pieces/${piece.prefab}.yml`,
        "unresolved-upgrade-station",
        `Upgrade station prefab "${piece.upgradeStationPrefab}" is not in the piece index.`,
      )
    }

    for (const requirement of piece.buildRequirements) {
      if (!itemsByPrefab.has(requirement.prefab)) {
        addDiagnostic(
          diagnostics,
          `pieces/${piece.prefab}.yml`,
          "unresolved-requirement-prefab",
          `Build requirement prefab "${requirement.prefab}" is not in the item index.`,
        )
      }
    }

    for (const conversion of piece.processingConversions ?? []) {
      if (!itemsByPrefab.has(conversion.inputPrefab)) {
        addDiagnostic(
          diagnostics,
          `pieces/${piece.prefab}.yml`,
          "unresolved-processing-input",
          `Processing input prefab "${conversion.inputPrefab}" is not in the item index.`,
        )
      }
      if (!itemsByPrefab.has(conversion.resultPrefab)) {
        addDiagnostic(
          diagnostics,
          `pieces/${piece.prefab}.yml`,
          "unresolved-processing-result",
          `Processing result prefab "${conversion.resultPrefab}" is not in the item index.`,
        )
      }
    }
  }

  return {
    items: [...itemsByPrefab.values()],
    recipes,
    pieces: [...piecesByPrefab.values()],
    diagnostics,
    itemsByPrefab,
    recipesByResultPrefab,
    piecesByPrefab,
  }
}