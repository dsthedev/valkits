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

export function calculateKitResources(
  kit: Kit,
  data: RecipeDataAccess,
): KitResourceCalculation {
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

  for (const goal of kit.itemGoals) {
    const item = data.getItem(goal.prefab)
    const quantity = goal.quantity ?? 1

    if (!item) {
      addLeaf(goal.prefab, quantity)
      addUnresolved(goal.prefab, quantity, "unknown-prefab")
      continue
    }

    const capabilities = getItemGoalCapabilities(item)
    if (quantity > 1 && !capabilities.quantity) {
      addUnresolved(goal.prefab, quantity, "invalid-quantity")
      continue
    }

    if (goal.targetQuality !== undefined && goal.targetQuality > 1) {
      if (
        capabilities.maxQuality === null ||
        goal.targetQuality > capabilities.maxQuality
      ) {
        addUnresolved(goal.prefab, quantity, "invalid-target-quality")
      } else {
        addUnresolved(goal.prefab, quantity, "unsupported-quality")
      }
      continue
    }

    resolvePrefab(goal.prefab, quantity, new Set())
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
    kitId: kit.id,
    leafRequirements,
    unresolved,
    limitations: [...calculationLimitations],
    isComplete: unresolved.length === 0,
  }
}