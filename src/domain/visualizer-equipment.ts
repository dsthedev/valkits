import type { GameItem, Kit, KitItemGoal } from "./schema"

const armorAndUtilityTypes = new Set([
  "Head",
  "Helmet",
  "Chest",
  "Legs",
  "Shoulder",
  "Shield",
  "Utility",
  "Tool",
  "Torch",
  "Trinket",
])
const weaponTypes = new Set([
  "Bow",
  "OneHandedWeapon",
  "TwoHandedWeapon",
  "TwoHandedWeaponLeft",
])

export function selectVisualizerEquipment(
  kit: Kit | undefined,
  getItem: (prefab: string) => GameItem | undefined
): {
  armorAndUtility: { goal: KitItemGoal; item: GameItem }[]
  weapons: { goal: KitItemGoal; item: GameItem }[]
} {
  const armorAndUtility: { goal: KitItemGoal; item: GameItem }[] = []
  const weapons: { goal: KitItemGoal; item: GameItem }[] = []

  for (const goal of kit?.itemGoals ?? []) {
    const item = getItem(goal.prefab)
    if (!item || item.foodStats || !item.itemType) continue
    if (armorAndUtilityTypes.has(item.itemType))
      armorAndUtility.push({ goal, item })
    else if (weaponTypes.has(item.itemType)) weapons.push({ goal, item })
  }

  return { armorAndUtility, weapons }
}
