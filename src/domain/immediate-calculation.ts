import { getItemGoalCapabilities } from "./item-goal-capabilities"
import type { RecipeDataAccess } from "./resource-calculation"
import type { Kit, KitItemGoal } from "./schema"

export type ImmediateCalculationReason =
  | "unknown-item"
  | "no-recipe"
  | "disabled-recipe"
  | "upgrade-only-recipe"
  | "ambiguous-recipe"
  | "alternative-requirements"
  | "invalid-quantity"
  | "invalid-target-quality"
  | "quality-upgrades-disabled"
  | "unsupported-upgrade-requirements"
  | "unsupported-quality-batch"

export interface ImmediateRequirementTotal {
  prefab: string
  craftAmount: number
  qualityAmount: number
  totalAmount: number
}

export interface ImmediateCalculationIssue {
  prefab: string
  reason: ImmediateCalculationReason
}

export interface ImmediateKitCalculation {
  kitId: string
  requirements: ImmediateRequirementTotal[]
  unresolved: ImmediateCalculationIssue[]
  limitations: string[]
  isComplete: boolean
}

export interface ImmediateItemCalculation {
  requirements: ImmediateRequirementTotal[]
  unresolved: ImmediateCalculationIssue[]
}

const immediateCalculationLimitations = [
  "Only direct recipe ingredients are included; ingredient recipes and stations are not expanded.",
  "Quality totals add the exported per-level increment to the base recipe amount.",
  "Recovery flags are not subtracted from recipe requirements.",
]

export function calculateImmediateKitRequirements(
  kit: Kit,
  data: RecipeDataAccess,
): ImmediateKitCalculation {
  const totalsByPrefab = new Map<string, ImmediateRequirementTotal>()
  const unresolvedByKey = new Map<string, ImmediateCalculationIssue>()

  for (const goal of kit.itemGoals) {
    const itemCalculation = calculateImmediateItemRequirements(goal, data)
    for (const requirement of itemCalculation.requirements) {
      const existing = totalsByPrefab.get(requirement.prefab)

      if (existing) {
        existing.craftAmount += requirement.craftAmount
        existing.qualityAmount += requirement.qualityAmount
        existing.totalAmount += requirement.totalAmount
      } else {
        totalsByPrefab.set(requirement.prefab, {
          ...requirement,
        })
      }
    }
    for (const issue of itemCalculation.unresolved) {
      unresolvedByKey.set(`${issue.reason}:${issue.prefab}`, issue)
    }
  }

  const requirements = [...totalsByPrefab.values()].sort((left, right) =>
    left.prefab.localeCompare(right.prefab),
  )
  const unresolved = [...unresolvedByKey.values()].sort((left, right) =>
    left.prefab === right.prefab
      ? left.reason.localeCompare(right.reason)
      : left.prefab.localeCompare(right.prefab),
  )

  return {
    kitId: kit.id,
    requirements,
    unresolved,
    limitations: [...immediateCalculationLimitations],
    isComplete: unresolved.length === 0,
  }
}

export function calculateImmediateItemRequirements(
  goal: KitItemGoal,
  data: RecipeDataAccess,
): ImmediateItemCalculation {
  const totalsByPrefab = new Map<string, ImmediateRequirementTotal>()
  const unresolvedByKey = new Map<string, ImmediateCalculationIssue>()

  function addIssue(prefab: string, reason: ImmediateCalculationReason): void {
    unresolvedByKey.set(`${reason}:${prefab}`, { prefab, reason })
  }

  const item = data.getItem(goal.prefab)
  if (!item) {
    addIssue(goal.prefab, "unknown-item")
  } else {
    const quantity = goal.quantity ?? 1
    const targetQuality = goal.targetQuality ?? 1
    const capabilities = getItemGoalCapabilities(item)
    if (quantity > 1 && !capabilities.quantity) {
      addIssue(goal.prefab, "invalid-quantity")
    } else {
      const recipes = data.getRecipes(goal.prefab)
      if (recipes.length === 0) {
        addIssue(goal.prefab, "no-recipe")
      } else {
        const enabledRecipes = recipes.filter(
          (recipe) => recipe.disabled !== true,
        )
        if (enabledRecipes.length === 0) {
          addIssue(goal.prefab, "disabled-recipe")
        } else {
          const craftRecipes = enabledRecipes.filter(
            (recipe) => recipe.noCraftOnlyUpgrade !== true,
          )
          if (craftRecipes.length === 0) {
            addIssue(goal.prefab, "upgrade-only-recipe")
          } else if (craftRecipes.length > 1) {
            addIssue(goal.prefab, "ambiguous-recipe")
          } else {
            const recipe = craftRecipes[0]
            if (recipe?.requireOnlyOneIngredient) {
              addIssue(goal.prefab, "alternative-requirements")
            } else if (recipe) {
              let includeQualityAmounts = targetQuality > 1
              if (targetQuality > 1) {
                if (
                  capabilities.maxQuality === null ||
                  targetQuality > capabilities.maxQuality
                ) {
                  addIssue(goal.prefab, "invalid-target-quality")
                  includeQualityAmounts = false
                } else if (recipe.disabledUpgrade) {
                  addIssue(goal.prefab, "quality-upgrades-disabled")
                  includeQualityAmounts = false
                } else if (recipe.upgradeRequirements?.length) {
                  addIssue(goal.prefab, "unsupported-upgrade-requirements")
                  includeQualityAmounts = false
                } else if (recipe.outputAmount !== 1) {
                  addIssue(goal.prefab, "unsupported-quality-batch")
                  includeQualityAmounts = false
                }
              }

              const crafts = Math.ceil(quantity / recipe.outputAmount)
              const qualitySteps = includeQualityAmounts
                ? targetQuality - 1
                : 0

              for (const requirement of recipe.requirements) {
                const craftAmount = requirement.amount * crafts
                const qualityAmount =
                  requirement.amountPerLevel * qualitySteps * quantity
                if (craftAmount > 0 || qualityAmount > 0) {
                  totalsByPrefab.set(requirement.prefab, {
                    prefab: requirement.prefab,
                    craftAmount,
                    qualityAmount,
                    totalAmount: craftAmount + qualityAmount,
                  })
                }
              }
            }
          }
        }
      }
    }
  }

  return {
    requirements: [...totalsByPrefab.values()].sort((left, right) =>
      left.prefab.localeCompare(right.prefab),
    ),
    unresolved: [...unresolvedByKey.values()].sort((left, right) =>
      left.prefab === right.prefab
        ? left.reason.localeCompare(right.reason)
        : left.prefab.localeCompare(right.prefab),
    ),
  }
}