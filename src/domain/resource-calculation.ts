import {
  calculateImmediateKitRequirements,
  type ImmediateCalculationReason,
  type ImmediateRequirementTotal,
} from "./immediate-calculation"
import { getItemGoalCapabilities } from "./item-goal-capabilities"
import type {
  GameItem,
  GameProcessingConversion,
  GameRecipe,
  Kit,
} from "./schema"

export type UnresolvedReason =
  | "unknown-prefab"
  | "known-item-no-recipe"
  | "disabled-recipe"
  | "upgrade-only-recipe"
  | "ambiguous-recipe"
  | "alternative-requirements"
  | "ambiguous-processing-conversion"
  | "ambiguous-acquisition-source"
  | "circular-recipe"
  | "invalid-quantity"
  | "invalid-target-quality"
  | "unsupported-quality"
  | "quality-upgrades-disabled"
  | "unsupported-upgrade-requirements"
  | "unsupported-quality-batch"

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
  getProcessingConversions?(
    resultPrefab: string,
  ): readonly GameProcessingConversion[]
}

export interface ResourceResolution {
  leafRequirements: ResourceRequirement[]
  unresolved: UnresolvedRequirement[]
  isComplete: boolean
}

export interface KitResourceCalculation {
  kitId: string
  directRequirements: ImmediateRequirementTotal[]
  leafRequirements: ResourceRequirement[]
  unresolved: UnresolvedRequirement[]
  limitations: string[]
  isComplete: boolean
}

const calculationLimitations = [
  "Leaf requirements are not classified as gatherable or otherwise acquired.",
  "Smelter conversion yield is assumed to be one output per input.",
  "Requirement recovery flags do not reduce crafting input totals.",
  "Processing conversion removal flags are not interpreted.",
]

const rootResolutionReasons = new Set<ImmediateCalculationReason>([
  "unknown-item",
  "no-recipe",
  "disabled-recipe",
  "upgrade-only-recipe",
  "ambiguous-recipe",
  "alternative-requirements",
])

const immediateIssueReasons: Partial<
  Record<ImmediateCalculationReason, UnresolvedReason>
> = {
  "invalid-quantity": "invalid-quantity",
  "invalid-target-quality": "invalid-target-quality",
  "quality-upgrades-disabled": "quality-upgrades-disabled",
  "unsupported-upgrade-requirements": "unsupported-upgrade-requirements",
  "unsupported-quality-batch": "unsupported-quality-batch",
}

export function calculateResourceRequirements(
  requirements: readonly ResourceRequirement[],
  data: RecipeDataAccess,
  initialAncestors: ReadonlySet<string> = new Set(),
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
    const enabledRecipes = recipes.filter((recipe) => recipe.disabled !== true)
    const craftRecipes = enabledRecipes.filter(
      (recipe) => recipe.noCraftOnlyUpgrade !== true,
    )
    const conversions = data.getProcessingConversions?.(prefab) ?? []

    if (craftRecipes.length > 1) {
      addUnresolved(prefab, amount, "ambiguous-recipe")
      return
    }
    if (craftRecipes.length === 0 && conversions.length > 1) {
      addUnresolved(prefab, amount, "ambiguous-processing-conversion")
      return
    }

    const conversion = craftRecipes.length === 0 ? conversions[0] : undefined
    if (conversion) {
      const inputBatches = Math.ceil(amount / conversion.outputAmount)
      const outputAmount = inputBatches * conversion.outputAmount
      const nextAncestors = new Set(ancestors)
      nextAncestors.add(prefab)
      resolvePrefab(
        conversion.inputPrefab,
        inputBatches,
        nextAncestors,
      )
      if (conversion.fuelPrefab && conversion.fuelPerProduct) {
        resolvePrefab(
          conversion.fuelPrefab,
          outputAmount * conversion.fuelPerProduct,
          nextAncestors,
        )
      }
      return
    }

    if (enabledRecipes.length === 0) {
      addUnresolved(
        prefab,
        amount,
        recipes.length === 0 ? "known-item-no-recipe" : "disabled-recipe",
      )
      if (recipes.length === 0) addLeaf(prefab, amount)
      return
    }
    if (craftRecipes.length === 0) {
      addUnresolved(prefab, amount, "upgrade-only-recipe")
      return
    }

    const recipe = craftRecipes[0]
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
    resolvePrefab(requirement.prefab, requirement.amount, initialAncestors)
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
  const direct = calculateImmediateKitRequirements(kit, data)
  const resolvedByGoal: ResourceResolution[] = []

  for (const goal of kit.itemGoals) {
    const goalCalculation = calculateImmediateKitRequirements(
      { ...kit, itemGoals: [goal] },
      data,
    )
    const requirements = goalCalculation.requirements.map((requirement) => ({
      prefab: requirement.prefab,
      amount: requirement.totalAmount,
    }))
    const unresolved: UnresolvedRequirement[] = []

    for (const issue of goalCalculation.unresolved) {
      if (rootResolutionReasons.has(issue.reason)) {
        const item = data.getItem(goal.prefab)
        if (
          issue.reason === "no-recipe" &&
          goal.targetQuality &&
          goal.targetQuality > 1 &&
          item
        ) {
          const capabilities = getItemGoalCapabilities(item)
          unresolved.push({
            prefab: goal.prefab,
            amount: goal.quantity ?? 1,
            reason:
              capabilities.maxQuality === null ||
              goal.targetQuality > capabilities.maxQuality
                ? "invalid-target-quality"
                : "unsupported-quality",
          })
          continue
        }

        requirements.push({
          prefab: goal.prefab,
          amount: goal.quantity ?? 1,
        })
        continue
      }

      const reason = immediateIssueReasons[issue.reason]
      if (reason) {
        unresolved.push({
          prefab: goal.prefab,
          amount: goal.quantity ?? 1,
          reason,
        })
      }
    }

    const resolved = calculateResourceRequirements(
      requirements,
      data,
      goalCalculation.requirements.length > 0
        ? new Set([goal.prefab])
        : new Set(),
    )
    resolvedByGoal.push({
      ...resolved,
      unresolved: [...resolved.unresolved, ...unresolved],
      isComplete: resolved.isComplete && unresolved.length === 0,
    })
  }

  const leafTotals = new Map<string, number>()
  const unresolvedByKey = new Map<string, UnresolvedRequirement>()
  for (const result of resolvedByGoal) {
    for (const requirement of result.leafRequirements) {
      leafTotals.set(
        requirement.prefab,
        (leafTotals.get(requirement.prefab) ?? 0) + requirement.amount,
      )
    }
    for (const issue of result.unresolved) {
      const key = `${issue.reason}:${issue.prefab}`
      const existing = unresolvedByKey.get(key)
      if (existing) existing.amount += issue.amount
      else unresolvedByKey.set(key, { ...issue })
    }
  }

  const leafRequirements = [...leafTotals]
    .map(([prefab, amount]) => ({ prefab, amount }))
    .sort((left, right) => left.prefab.localeCompare(right.prefab))
  const unresolved = [...unresolvedByKey.values()].sort((left, right) =>
    left.prefab === right.prefab
      ? left.reason.localeCompare(right.reason)
      : left.prefab.localeCompare(right.prefab),
  )

  return {
    kitId: kit.id,
    directRequirements: direct.requirements,
    leafRequirements,
    unresolved,
    limitations: [...calculationLimitations],
    isComplete:
      resolvedByGoal.every((result) => result.isComplete) &&
      unresolved.length === 0,
  }
}