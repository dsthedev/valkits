import type { GameItem, Kit } from "./schema"

export interface StatContribution {
  prefab: string
  value: number
}

export interface StatBreakdown {
  base: number
  contributions: StatContribution[]
  total: number
}

export interface ShieldStatSummary {
  prefab: string
  blockPower: number
  deflectionForce: number
  timedBlockBonus: number
}

export interface KitStatSummary {
  health: StatBreakdown
  stamina: StatBreakdown
  eitr: StatBreakdown
  armor: StatBreakdown
  armorItemCount: number
  shield: ShieldStatSummary | null
  ignoredFoodCount: number
}

type ItemLookup = (prefab: string) => GameItem | undefined

const BASE_STATS = { health: 25, stamina: 50, eitr: 0 } as const
const ACTIVE_FOOD_SLOTS = 3
const ARMOR_ITEM_TYPES = new Set([
  "Head",
  "Helmet",
  "Chest",
  "Legs",
  "Shoulder",
  "Shield",
])
const COUNTED_ARMOR_ITEM_TYPES = new Set([
  "Head",
  "Helmet",
  "Chest",
  "Legs",
  "Shoulder",
])
const MAX_ARMOR_ITEMS = 3

function breakdown(
  base: number,
  contributions: StatContribution[],
): StatBreakdown {
  return {
    base,
    contributions,
    total: base + contributions.reduce((total, entry) => total + entry.value, 0),
  }
}

function qualityValue(
  base: number | undefined,
  perLevel: number | undefined,
  quality: number,
): number {
  return (base ?? 0) + (perLevel ?? 0) * (quality - 1)
}

export function calculateKitStats(kit: Kit, getItem: ItemLookup): KitStatSummary {
  const foods = kit.itemGoals.flatMap((goal) => {
    const item = getItem(goal.prefab)
    return item?.foodStats ? [{ prefab: goal.prefab, stats: item.foodStats }] : []
  })
  const activeFoods = foods.slice(0, ACTIVE_FOOD_SLOTS)
  const statBreakdown = (key: "health" | "stamina" | "eitr", base: number) =>
    breakdown(
      base,
      activeFoods.flatMap(({ prefab, stats }) => {
        const value = stats[key] ?? 0
        return value === 0 ? [] : [{ prefab, value }]
      }),
    )

  const armorContributions = kit.itemGoals.flatMap((goal) => {
    const item = getItem(goal.prefab)
    if (!item?.armorStats || !item.itemType) return []

    const isArmor =
      ARMOR_ITEM_TYPES.has(item.itemType) ||
      (item.itemType === "Utility" && (item.armorStats.armor ?? 0) <= 1)
    if (!isArmor) return []

    const value = qualityValue(
      item.armorStats.armor,
      item.armorStats.armorPerLevel,
      goal.targetQuality ?? 1,
    )
    return value === 0 ? [] : [{ prefab: goal.prefab, value }]
  })
  const armorItemCount = Math.min(
    MAX_ARMOR_ITEMS,
    kit.itemGoals.filter((goal) => {
      const item = getItem(goal.prefab)
      return (
        item?.armorStats !== undefined &&
        item.itemType !== undefined &&
        COUNTED_ARMOR_ITEM_TYPES.has(item.itemType)
      )
    }).length,
  )

  const firstShieldGoal = kit.itemGoals.find(
    (goal) => getItem(goal.prefab)?.itemType === "Shield",
  )
  const firstShield = firstShieldGoal
    ? getItem(firstShieldGoal.prefab)
    : undefined
  const shieldStats = firstShield?.shieldStats
  const shield =
    firstShieldGoal && shieldStats
      ? {
          prefab: firstShieldGoal.prefab,
          blockPower: qualityValue(
            shieldStats.blockPower,
            shieldStats.blockPowerPerLevel,
            firstShieldGoal.targetQuality ?? 1,
          ),
          deflectionForce: qualityValue(
            shieldStats.deflectionForce,
            shieldStats.deflectionForcePerLevel,
            firstShieldGoal.targetQuality ?? 1,
          ),
          timedBlockBonus: shieldStats.timedBlockBonus ?? 0,
        }
      : null

  return {
    health: statBreakdown("health", BASE_STATS.health),
    stamina: statBreakdown("stamina", BASE_STATS.stamina),
    eitr: statBreakdown("eitr", BASE_STATS.eitr),
    armor: breakdown(0, armorContributions),
    armorItemCount,
    shield,
    ignoredFoodCount: Math.max(0, foods.length - ACTIVE_FOOD_SLOTS),
  }
}