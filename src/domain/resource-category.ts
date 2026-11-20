export const resourceCategories = [
  "Food & consumables",
  "Materials",
  "Gear & ammo",
  "Other",
] as const

export type ResourceCategory = (typeof resourceCategories)[number]

const foodAndConsumableTypes = new Set(["Consumable", "Fish"])
const materialTypes = new Set(["Material"])
const gearTypes = new Set([
  "Ammo",
  "AmmoNonEquipable",
  "Bow",
  "Chest",
  "Helmet",
  "Legs",
  "OneHandedWeapon",
  "Shield",
  "Shoulder",
  "Tool",
  "Torch",
  "Trinket",
  "TwoHandedWeapon",
  "TwoHandedWeaponLeft",
  "Utility",
])

export function getResourceCategory(
  itemType: string | undefined,
): ResourceCategory {
  if (itemType && foodAndConsumableTypes.has(itemType)) {
    return "Food & consumables"
  }
  if (itemType && materialTypes.has(itemType)) return "Materials"
  if (itemType && gearTypes.has(itemType)) return "Gear & ammo"
  return "Other"
}