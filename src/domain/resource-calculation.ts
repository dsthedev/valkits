import { getItemGoalCapabilities } from "./item-goal-capabilities"
import type { GameItem, GameRecipe, Kit } from "./schema"

export type UnresolvedReason =
  | "unknown-prefab"
  | "known-item-no-recipe"
  | "disabled-recipe"
  | "ambiguous-recipe"
  | "alternative-requirements"
  | "circular-recipe"
  | "invalid-quantity"
  | "invalid-target-quality"
  | "unsupported-quality"

export interface ResourceRequirement {
  prefab: string
  amount: number
}

export interface UnresolvedRequirement extends ResourceRequirement {
  reason: UnresolvedReason
}

export interface RecipeDataAccess {
  getItem(prefab: string): GameItem | undefined
  getRecipes(resultPrefab: string): readonly GameRecipe[]
}

export interface ResourceResolution {
  leafRequirements: ResourceRequirement[]
  unresolved: UnresolvedRequirement[]
  isComplete: boolean
}

export interface KitResourceCalculation {
  kitId: string
  leafRequirements: ResourceRequirement[]
  unresolved: UnresolvedRequirement[]
  limitations: string[]
  isComplete: boolean
}

const calculationLimitations = [
  "Leaf requirements are not classified as gatherable or otherwise acquired.",
  "Higher-quality upgrade costs are not calculated; base ingredient amounts are used.",
  "Requirement recovery flags do not reduce crafting input totals.",
]

export function calculateResourceRequirements(
  requirements: readonly ResourceRequirement[],
  data: RecipeDataAccess,
): ResourceResolution {
  const leafTotals = new Map<string, number>()
  const unresolvedTotals = new Map<string, UnresolvedRequirement>()

  function addLeaf(prefab: string, amount: number): void {
    leafTotals.set(prefab, (leafTotals.get(prefab) ?? 0) + amount)
  }

  function addUnresolved(
    prefab: string,
    amount: number,
    reason: UnresolvedReason,
  ): void {
    const key = `${reason}:${prefab}`
    const existing = unresolvedTotals.get(key)
    if (existing) {
      existing.amount += amount
    } else {
      unresolvedTotals.set(key, { prefab, amount, reason })
    }
  }

  function resolvePrefab(
    prefab: string,
    amount: number,
    ancestors: ReadonlySet<string>,
  ): void {
    if (amount <= 0) return

    if (ancestors.has(prefab)) {
      addUnresolved(prefab, amount, "circular-recipe")
      return
    }

    const item = data.getItem(prefab)
    if (!item) {
      addLeaf(prefab, amount)
      addUnresolved(prefab, amount, "unknown-prefab")
      return
    }

    const recipes = data.getRecipes(prefab)
    if (recipes.length === 0) {
      addLeaf(prefab, amount)
      addUnresolved(prefab, amount, "known-item-no-recipe")
      return
    }

    const enabledRecipes = recipes.filter((recipe) => recipe.disabled !== true)
    if (enabledRecipes.length === 0) {
      addUnresolved(prefab, amount, "disabled-recipe")
      return
    }
    if (enabledRecipes.length > 1) {
      addUnresolved(prefab, amount, "ambiguous-recipe")
      return
    }

    const recipe = enabledRecipes[0]
    if (!recipe) return
    if (recipe.requireOnlyOneIngredient) {
      addUnresolved(prefab, amount, "alternative-requirements")
      return
    }

    const crafts = Math.ceil(amount / recipe.outputAmount)
    const nextAncestors = new Set(ancestors)
    nextAncestors.add(prefab)

    for (const requirement of recipe.requirements) {
      resolvePrefab(
        requirement.prefab,
        requirement.amount * crafts,
        nextAncestors,
      )
    }
  }

  for (const requirement of requirements) {
    resolvePrefab(requirement.prefab, requirement.amount, new Set())
  }

  const leafRequirements = [...leafTotals]
    .map(([prefab, amount]) => ({ prefab, amount }))
    .sort((left, right) => left.prefab.localeCompare(right.prefab))
  const unresolved = [...unresolvedTotals.values()].sort((left, right) =>
    left.prefab === right.prefab
      ? left.reason.localeCompare(right.reason)
      : left.prefab.localeCompare(right.prefab),
  )

  return {
    leafRequirements,
    unresolved,
    isComplete: unresolved.length === 0,
  }
}

export function calculateKitResources(
  kit: Kit,
  data: RecipeDataAccess,
): KitResourceCalculation {
  const validRequirements: ResourceRequirement[] = []
  const invalidRequirements: UnresolvedRequirement[] = []

  for (const goal of kit.itemGoals) {
    const item = data.getItem(goal.prefab)
    const quantity = goal.quantity ?? 1

    if (!item) {
      validRequirements.push({ prefab: goal.prefab, amount: quantity })
      continue
    }

    const capabilities = getItemGoalCapabilities(item)
    if (quantity > 1 && !capabilities.quantity) {
      invalidRequirements.push({
        prefab: goal.prefab,
        amount: quantity,
        reason: "invalid-quantity",
      })
      continue
    }

    if (goal.targetQuality !== undefined && goal.targetQuality > 1) {
      invalidRequirements.push({
        prefab: goal.prefab,
        amount: quantity,
        reason:
          capabilities.maxQuality === null ||
          goal.targetQuality > capabilities.maxQuality
            ? "invalid-target-quality"
            : "unsupported-quality",
      })
      continue
    }

    validRequirements.push({ prefab: goal.prefab, amount: quantity })
  }

  const resolved = calculateResourceRequirements(validRequirements, data)
  const unresolvedByKey = new Map<string, UnresolvedRequirement>()
  for (const issue of [...resolved.unresolved, ...invalidRequirements]) {
    const key = `${issue.reason}:${issue.prefab}`
    const existing = unresolvedByKey.get(key)
    if (existing) {
      existing.amount += issue.amount
    } else {
      unresolvedByKey.set(key, { ...issue })
    }
  }
  const unresolved = [...unresolvedByKey.values()].sort((left, right) =>
    left.prefab === right.prefab
      ? left.reason.localeCompare(right.reason)
      : left.prefab.localeCompare(right.prefab),
  )

  return {
    kitId: kit.id,
    leafRequirements: resolved.leafRequirements,
    unresolved,
    limitations: [...calculationLimitations],
    isComplete: unresolved.length === 0,
  }
}