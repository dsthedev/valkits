import type { Kit } from "./schema"

const upgraderItemPrefabPattern = /^Upgrader\d+(?:Armor|Weapon)$/i

export function isUpgraderItemPrefab(prefab: string): boolean {
  return upgraderItemPrefabPattern.test(prefab)
}

export function withoutUpgraderItemGoals(kit: Kit): Kit {
  return {
    ...kit,
    itemGoals: kit.itemGoals.filter(
      (goal) => !isUpgraderItemPrefab(goal.prefab),
    ),
  }
}
