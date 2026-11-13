import type { GameItem } from "./schema"

const quantityItemTypes = new Set(["Ammo", "Consumable", "Material", "Misc"])
const qualityItemTypes = new Set([
  "Bow",
  "Chest",
  "Helmet",
  "Legs",
  "OneHandedWeapon",
  "Shield",
  "Shoulder",
  "TwoHandedWeapon",
])

export interface ItemGoalCapabilities {
  quantity: boolean
  maxQuality: number | null
}

export function getItemGoalCapabilities(item: GameItem): ItemGoalCapabilities {
  const quantity =
    item.itemType !== undefined &&
    quantityItemTypes.has(item.itemType) &&
    (item.maxStackSize ?? 1) > 1
  const maxQuality =
    item.itemType !== undefined &&
    qualityItemTypes.has(item.itemType) &&
    (item.maxQuality ?? 1) > 1
      ? item.maxQuality!
      : null

  return { quantity, maxQuality }
}