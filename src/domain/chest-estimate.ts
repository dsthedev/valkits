import type { GameItem, GamePiece } from "./schema"

export function estimateChestStorage(
  resources: readonly { prefab: string; amount: number }[],
  chest: GamePiece | undefined,
  getItem: (prefab: string) => GameItem | undefined,
) {
  if (!chest?.containerSize || chest.disabled || chest.buildRequirements.length === 0) {
    return undefined
  }

  let slots = 0
  const missingStackSizes: string[] = []
  for (const resource of resources) {
    if (resource.amount <= 0) continue
    const stackSize = getItem(resource.prefab)?.maxStackSize
    if (!stackSize) {
      missingStackSizes.push(resource.prefab)
      continue
    }
    slots += Math.ceil(resource.amount / stackSize)
  }

  const capacity = chest.containerSize.Width * chest.containerSize.Height
  const count = Math.ceil(slots / capacity)
  return {
    slots,
    capacity,
    count,
    costs: chest.buildRequirements.map(({ prefab, amount }) => ({
      prefab,
      amount: amount * count,
    })),
    missingStackSizes,
  }
}