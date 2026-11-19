import { calculateResourceRequirements } from "./resource-calculation"
import type {
  RecipeDataAccess,
  ResourceRequirement,
  UnresolvedRequirement,
} from "./resource-calculation"
import type { GamePiece } from "./schema"
import {
  groupStationRequirements,
  type ItemStationRequirement,
} from "./station-requirements"

export type StationResourceIssueReason =
  | "missing-station-piece"
  | "disabled-station-piece"
  | "missing-station-upgrade"
  | "unmapped-station-upgrade"
  | "ambiguous-station-upgrade"
  | "disabled-station-upgrade"

export interface StationResourceIssue {
  stationPrefab: string
  level?: number
  reason: StationResourceIssueReason
}

export interface StationResourceCalculation {
  stationResources: ResourceRequirement[]
  unresolvedResources: UnresolvedRequirement[]
  unresolvedStationRequirements: Extract<
    ItemStationRequirement,
    { status: "unresolved" }
  >[]
  unresolvedStations: StationResourceIssue[]
  limitations: string[]
  isComplete: boolean
}

export interface StationResourceDataAccess extends RecipeDataAccess {
  getStationPiece(stationReference: string): GamePiece | undefined
  getStationUpgrades(stationPrefab: string): readonly GamePiece[]
}

const stationResourceLimitations = [
  "Crafting stations needed to build station pieces are not expanded.",
  "Requirement per-level increments and recovery flags are not applied.",
  "Items without a known recipe remain unresolved.",
]

export function calculateStationResources(
  itemRequirements: readonly ItemStationRequirement[],
  data: StationResourceDataAccess,
): StationResourceCalculation {
  const unresolvedStationRequirements = itemRequirements.filter(
    (requirement) => requirement.status === "unresolved",
  )
  const stationGroups = groupStationRequirements(
    itemRequirements.filter((requirement) => requirement.status === "required"),
  )
  const unresolvedStations: StationResourceIssue[] = []
  const totalsByPrefab = new Map<string, number>()

  function addBuildRequirements(piece: GamePiece): void {
    for (const requirement of piece.buildRequirements) {
      totalsByPrefab.set(
        requirement.prefab,
        (totalsByPrefab.get(requirement.prefab) ?? 0) + requirement.amount,
      )
    }
  }

  for (const group of stationGroups) {
    const station = data.getStationPiece(group.stationPrefab)
    if (!station) {
      unresolvedStations.push({
        stationPrefab: group.stationPrefab,
        reason: "missing-station-piece",
      })
      continue
    }
    if (station.disabled) {
      unresolvedStations.push({
        stationPrefab: group.stationPrefab,
        reason: "disabled-station-piece",
      })
      continue
    }

    addBuildRequirements(station)
    const requiredLevel = group.stationLevel ?? 1
    const upgrades = data.getStationUpgrades(group.stationPrefab)
    for (let level = 2; level <= requiredLevel; level += 1) {
      const matchingUpgrades = upgrades.filter(
        (upgrade) => upgrade.upgradeLevel === level,
      )

      if (matchingUpgrades.length === 0) {
        unresolvedStations.push({
          stationPrefab: group.stationPrefab,
          level,
          reason: upgrades.some((upgrade) => upgrade.upgradeLevel === undefined)
            ? "unmapped-station-upgrade"
            : "missing-station-upgrade",
        })
        continue
      }
      if (matchingUpgrades.length > 1) {
        unresolvedStations.push({
          stationPrefab: group.stationPrefab,
          level,
          reason: "ambiguous-station-upgrade",
        })
        continue
      }

      const upgrade = matchingUpgrades[0]
      if (!upgrade) continue
      if (upgrade.disabled) {
        unresolvedStations.push({
          stationPrefab: group.stationPrefab,
          level,
          reason: "disabled-station-upgrade",
        })
        continue
      }
      addBuildRequirements(upgrade)
    }
  }

  const buildRequirements: ResourceRequirement[] = [...totalsByPrefab]
    .map(([prefab, amount]) => ({ prefab, amount }))
    .filter((requirement) => requirement.amount > 0)
  const resourceResult = calculateResourceRequirements(buildRequirements, data)
  return {
    stationResources: resourceResult.leafRequirements,
    unresolvedResources: resourceResult.unresolved,
    unresolvedStationRequirements,
    unresolvedStations,
    limitations: [...stationResourceLimitations],
    isComplete:
      resourceResult.isComplete &&
      unresolvedStations.length === 0 &&
      unresolvedStationRequirements.length === 0,
  }
}
