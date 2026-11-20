import type {
  GameItem,
  GamePiece,
  GameProcessingConversion,
  GameRecipe,
  Kit,
} from "./schema"
import { getItemGoalCapabilities } from "./item-goal-capabilities"

export type StationRequirementReason =
  | "unknown-item"
  | "no-recipe"
  | "disabled-recipe"
  | "upgrade-only-recipe"
  | "ambiguous-recipe"
  | "ambiguous-processing-conversion"
  | "ambiguous-acquisition-source"
  | "processing-cycle"
  | "unresolved-station"
  | "missing-station-level"
  | "invalid-target-quality"
  | "quality-upgrades-disabled"

interface ItemStationRequirementBase {
  itemPrefab: string
  targetQuality: number
}

export type ItemStationRequirement = ItemStationRequirementBase &
  (
    | {
        status: "required"
        stationReference: string
        stationPrefab: string
        stationLevel?: number
        outputAmountPerInput?: number
      }
    | { status: "no-station-listed" }
    | {
        status: "unresolved"
        reason: StationRequirementReason
        stationReference?: string
        stationPrefab?: string
        stationLevel?: number
      }
  )

  type GroupedStationRequirement =
    | Extract<ItemStationRequirement, { status: "required" }>
    | (Extract<ItemStationRequirement, { status: "unresolved" }> & {
        stationPrefab: string
      })

export interface StationRequirementGroup {
  stationPrefab: string
  stationLevel?: number
    itemRequirements: GroupedStationRequirement[]
  }

  function hasStationPrefab(
    requirement: ItemStationRequirement,
  ): requirement is GroupedStationRequirement {
    return (
      (requirement.status === "required" || requirement.status === "unresolved") &&
      typeof requirement.stationPrefab === "string"
    )
}

export function groupStationRequirements(
  itemRequirements: readonly ItemStationRequirement[],
): StationRequirementGroup[] {
  const groups = new Map<string, StationRequirementGroup>()

  for (const requirement of itemRequirements) {
    if (!hasStationPrefab(requirement)) continue
    const stationPrefab = requirement.stationPrefab

    const group = groups.get(stationPrefab)
    if (group) {
      if (requirement.stationLevel !== undefined) {
        group.stationLevel =
          group.stationLevel === undefined
            ? requirement.stationLevel
            : Math.max(group.stationLevel, requirement.stationLevel)
      }
      group.itemRequirements.push({ ...requirement, stationPrefab })
      continue
    }

    groups.set(stationPrefab, {
      stationPrefab,
      ...(requirement.stationLevel !== undefined
        ? { stationLevel: requirement.stationLevel }
        : {}),
      itemRequirements: [{ ...requirement, stationPrefab }],
    })
  }

  return [...groups.values()].sort((left, right) =>
    left.stationPrefab.localeCompare(right.stationPrefab),
  )
}

export interface KitStationRequirementCalculation {
  kitId: string
  itemRequirements: ItemStationRequirement[]
}

export interface StationRequirementDataAccess {
  getItem(prefab: string): GameItem | undefined
  getRecipes(resultPrefab: string): readonly GameRecipe[]
  getProcessingConversions(
    resultPrefab: string,
  ): readonly (GameProcessingConversion & { stationPrefab: string })[]
  getStationPiece(stationReference: string): GamePiece | undefined
}

export function calculateKitStationRequirements(
  kit: Kit,
  data: StationRequirementDataAccess,
): KitStationRequirementCalculation {
  const itemRequirements: ItemStationRequirement[] = []

  function resolveItem(
    prefab: string,
    targetQuality: number,
    ancestors: ReadonlySet<string>,
    isKitGoal: boolean,
  ): void {
    const base = { itemPrefab: prefab, targetQuality }
    if (ancestors.has(prefab)) {
      itemRequirements.push({
        ...base,
        status: "unresolved",
        reason: "processing-cycle",
      })
      return
    }
    const item = data.getItem(prefab)
    if (!item) {
      if (!isKitGoal) return
      itemRequirements.push({
        ...base,
        status: "unresolved",
        reason: "unknown-item",
      })
      return
    }

    const recipes = data.getRecipes(prefab)
    const enabledRecipes = recipes.filter((recipe) => recipe.disabled !== true)
    const craftRecipes = enabledRecipes.filter(
      (recipe) => recipe.noCraftOnlyUpgrade !== true,
    )
    const conversions = data.getProcessingConversions(prefab)

    if (
      craftRecipes.length > 1 ||
      (craftRecipes.length === 0 && conversions.length > 1)
    ) {
      itemRequirements.push({
        ...base,
        status: "unresolved",
        reason:
          craftRecipes.length > 1
            ? "ambiguous-recipe"
            : "ambiguous-processing-conversion",
      })
      return
    }

    const conversion = craftRecipes.length === 0 ? conversions[0] : undefined
    if (conversion) {
      const stationPiece = data.getStationPiece(conversion.stationPrefab)
      if (!stationPiece) {
        itemRequirements.push({
          ...base,
          stationReference: conversion.stationPrefab,
          status: "unresolved",
          reason: "unresolved-station",
        })
        return
      }

      itemRequirements.push({
        ...base,
        stationReference: conversion.stationPrefab,
        stationPrefab: stationPiece.prefab,
        outputAmountPerInput: conversion.outputAmount,
        status: "required",
      })
      const nextAncestors = new Set(ancestors)
      nextAncestors.add(prefab)
      resolveItem(conversion.inputPrefab, 1, nextAncestors, false)
      if (conversion.fuelPrefab) {
        resolveItem(conversion.fuelPrefab, 1, nextAncestors, false)
      }
      return
    }

    if (craftRecipes.length === 0) {
      const reason =
        recipes.length === 0
          ? "no-recipe"
          : enabledRecipes.length === 0
            ? "disabled-recipe"
            : "upgrade-only-recipe"
      if (!isKitGoal && recipes.length === 0) return
      itemRequirements.push({ ...base, status: "unresolved", reason })
      return
    }

    const recipe = craftRecipes[0]
    if (!recipe) {
      if (!isKitGoal) return
      itemRequirements.push({ ...base, status: "unresolved", reason: "no-recipe" })
      return
    }
    const nextAncestors = new Set(ancestors)
    nextAncestors.add(prefab)
    function resolveRecipeIngredients(): void {
      if (recipe.requireOnlyOneIngredient) return

      const ingredientPrefabs = new Set(
        recipe.requirements
          .filter(
            (requirement) =>
              requirement.amount > 0 ||
              (targetQuality > 1 && requirement.amountPerLevel > 0),
          )
          .map((requirement) => requirement.prefab),
      )
      if (targetQuality > 1) {
        for (const requirement of recipe.upgradeRequirements ?? []) {
          if (requirement.amount > 0 || requirement.amountPerLevel > 0) {
            ingredientPrefabs.add(requirement.prefab)
          }
        }
      }
      for (const ingredientPrefab of ingredientPrefabs) {
        resolveItem(ingredientPrefab, 1, nextAncestors, false)
      }
    }

    if (!recipe.craftingStation) {
      itemRequirements.push({ ...base, status: "no-station-listed" })
      resolveRecipeIngredients()
      return
    }

    const capabilities = getItemGoalCapabilities(item)
    if (
      targetQuality > 1 &&
      (capabilities.maxQuality === null ||
        targetQuality > capabilities.maxQuality)
    ) {
      itemRequirements.push({
        ...base,
        stationReference: recipe.craftingStation,
        status: "unresolved",
        reason: "invalid-target-quality",
      })
      resolveRecipeIngredients()
      return
    }
    if (targetQuality > 1 && recipe.disabledUpgrade) {
      itemRequirements.push({
        ...base,
        stationReference: recipe.craftingStation,
        status: "unresolved",
        reason: "quality-upgrades-disabled",
      })
      resolveRecipeIngredients()
      return
    }

    const stationLevel =
      recipe.minStationLevel === undefined
        ? undefined
        : recipe.minStationLevel + targetQuality - 1

    const stationPiece = data.getStationPiece(recipe.craftingStation)
    const stationInfo = {
      ...base,
      stationReference: recipe.craftingStation,
      ...(stationPiece ? { stationPrefab: stationPiece.prefab } : {}),
      ...(stationLevel !== undefined
        ? { stationLevel }
        : {}),
    }
    if (!stationPiece) {
      itemRequirements.push({
        ...stationInfo,
        status: "unresolved",
        reason: "unresolved-station",
      })
      resolveRecipeIngredients()
      return
    }
    if (recipe.minStationLevel === undefined) {
      itemRequirements.push({
        ...stationInfo,
        status: "unresolved",
        reason: "missing-station-level",
      })
      resolveRecipeIngredients()
      return
    }

    itemRequirements.push({
      ...stationInfo,
      stationPrefab: stationPiece.prefab,
      stationLevel,
      status: "required",
    })
    resolveRecipeIngredients()
  }

  for (const goal of kit.itemGoals) {
    resolveItem(goal.prefab, goal.targetQuality ?? 1, new Set(), true)
  }

  return { kitId: kit.id, itemRequirements }
}
