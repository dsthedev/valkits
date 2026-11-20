import type { GameItem } from "./schema"

export function getLongestFoodDurationSeconds(
  items: readonly GameItem[],
): number | null {
  return items.reduce<number | null>((longest, item) => {
    const durationSeconds = item.foodStats?.durationSeconds
    if (durationSeconds === undefined || durationSeconds <= 0) return longest

    return longest === null ? durationSeconds : Math.max(longest, durationSeconds)
  }, null)
}