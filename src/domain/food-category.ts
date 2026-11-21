import type { GameItem, Kit, KitItemGoal } from "./schema"

export type FoodCategory = "health" | "stamina" | "eitr" | "mixed"

export function selectVisualizerFoods(
  kit: Kit | undefined,
  getItem: (prefab: string) => GameItem | undefined
): { foods: { goal: KitItemGoal; item: GameItem }[]; extraFoodCount: number } {
  const foods = (kit?.itemGoals ?? []).flatMap((goal) => {
    const item = getItem(goal.prefab)
    return item?.foodStats ? [{ goal, item }] : []
  })

  return {
    foods: foods.slice(0, 3),
    extraFoodCount: Math.max(foods.length - 3, 0),
  }
}

export function getFoodCategory(item: GameItem): FoodCategory | undefined {
  const stats = item.foodStats
  if (!stats) return undefined

  const values = [
    ["health", stats.health ?? 0],
    ["stamina", stats.stamina ?? 0],
    ["eitr", stats.eitr ?? 0],
  ] as const
  const highestValue = Math.max(...values.map(([, value]) => value))
  const leadingCategories = values.filter(([, value]) => value === highestValue)

  if (leadingCategories.length !== 1 || highestValue === 0) return "mixed"
  return leadingCategories[0]?.[0]
}
