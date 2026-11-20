import type { GameItem } from "./schema"

export type FoodCategory = "health" | "stamina" | "eitr" | "mixed"

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
