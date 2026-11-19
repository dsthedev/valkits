import type { GameItem, GamePiece, GameRecipe, Kit } from "./schema"

export type StationRequirementReason =
  | "unknown-item"
  | "no-recipe"
  | "disabled-recipe"
  | "upgrade-only-recipe"
  | "ambiguous-recipe"
  | "unresolved-station"
  | "missing-station-level"

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
        stationLevel: number
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

export interface StationRequirementGroup {
  stationPrefab: string
  stationLevel: number
  itemRequirements: Extract<ItemStationRequirement, { status: "required" }>[]
}

export function groupStationRequirements(
  itemRequirements: readonly ItemStationRequirement[],
): StationRequirementGroup[] {
  const groups = new Map<string, StationRequirementGroup>()

  for (const requirement of itemRequirements) {
    if (requirement.status !== "required") continue

    const group = groups.get(requirement.stationPrefab)
    if (group) {
      group.stationLevel = Math.max(group.stationLevel, requirement.stationLevel)
      group.itemRequirements.push(requirement)
      continue
    }

    groups.set(requirement.stationPrefab, {
      stationPrefab: requirement.stationPrefab,
      stationLevel: requirement.stationLevel,
      itemRequirements: [requirement],
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
  getStationPiece(stationReference: string): GamePiece | undefined
}

export function calculateKitStationRequirements(
  kit: Kit,
  data: StationRequirementDataAccess,
): KitStationRequirementCalculation {
  const itemRequirements = kit.itemGoals.map((goal): ItemStationRequirement => {
    const base = {
      itemPrefab: goal.prefab,
      targetQuality: goal.targetQuality ?? 1,
    }

    if (!data.getItem(goal.prefab)) {
      return { ...base, status: "unresolved", reason: "unknown-item" }
    }

    const recipes = data.getRecipes(goal.prefab)
    if (recipes.length === 0) {
      return { ...base, status: "unresolved", reason: "no-recipe" }
    }

    const enabledRecipes = recipes.filter((recipe) => recipe.disabled !== true)
    if (enabledRecipes.length === 0) {
      return { ...base, status: "unresolved", reason: "disabled-recipe" }
    }

    const craftRecipes = enabledRecipes.filter(
      (recipe) => recipe.noCraftOnlyUpgrade !== true,
    )
    if (craftRecipes.length === 0) {
      return { ...base, status: "unresolved", reason: "upgrade-only-recipe" }
    }
    if (craftRecipes.length > 1) {
      return { ...base, status: "unresolved", reason: "ambiguous-recipe" }
    }

    const recipe = craftRecipes[0]
    if (!recipe) {
      return { ...base, status: "unresolved", reason: "no-recipe" }
    }
    if (!recipe.craftingStation) {
      return { ...base, status: "no-station-listed" }
    }

    const stationPiece = data.getStationPiece(recipe.craftingStation)
    const stationInfo = {
      ...base,
      stationReference: recipe.craftingStation,
      ...(stationPiece ? { stationPrefab: stationPiece.prefab } : {}),
      ...(recipe.minStationLevel !== undefined
        ? { stationLevel: recipe.minStationLevel }
        : {}),
    }
    if (!stationPiece) {
      return {
        ...stationInfo,
        status: "unresolved",
        reason: "unresolved-station",
      }
    }
    if (recipe.minStationLevel === undefined) {
      return {
        ...stationInfo,
        status: "unresolved",
        reason: "missing-station-level",
      }
    }

    return {
      ...stationInfo,
      stationPrefab: stationPiece.prefab,
      stationLevel: recipe.minStationLevel,
      status: "required",
    }
  })

  return { kitId: kit.id, itemRequirements }
}
