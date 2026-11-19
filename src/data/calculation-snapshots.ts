import { z } from "zod"
import type {
  KitResourceCalculation,
  UnresolvedReason,
} from "../domain/resource-calculation"
import type {
  ItemStationRequirement,
  StationRequirementReason,
} from "../domain/station-requirements"
import type {
  StationResourceCalculation,
  StationResourceIssueReason,
} from "../domain/station-resource-calculation"

export const CALCULATION_SNAPSHOT_STORAGE_KEY = "valkits.calculations.v1"

const resourceReasonSchema = z.enum([
  "unknown-prefab",
  "known-item-no-recipe",
  "disabled-recipe",
  "upgrade-only-recipe",
  "ambiguous-recipe",
  "alternative-requirements",
  "ambiguous-processing-conversion",
  "ambiguous-acquisition-source",
  "circular-recipe",
  "invalid-quantity",
  "invalid-target-quality",
  "unsupported-quality",
  "quality-upgrades-disabled",
  "unsupported-upgrade-requirements",
  "unsupported-quality-batch",
]) satisfies z.ZodType<UnresolvedReason>

const stationRequirementReasonSchema = z.enum([
  "unknown-item",
  "no-recipe",
  "disabled-recipe",
  "upgrade-only-recipe",
  "ambiguous-recipe",
  "ambiguous-processing-conversion",
  "ambiguous-acquisition-source",
  "processing-cycle",
  "unresolved-station",
  "missing-station-level",
  "invalid-target-quality",
  "quality-upgrades-disabled",
]) satisfies z.ZodType<StationRequirementReason>

const stationResourceIssueReasonSchema = z.enum([
  "missing-station-piece",
  "disabled-station-piece",
  "missing-station-upgrade",
  "unmapped-station-upgrade",
  "ambiguous-station-upgrade",
  "disabled-station-upgrade",
]) satisfies z.ZodType<StationResourceIssueReason>

const resourceRequirementSchema = z.object({
  prefab: z.string().min(1),
  amount: z.number().int().nonnegative(),
})

const unresolvedRequirementSchema = resourceRequirementSchema.extend({
  reason: resourceReasonSchema,
})

const directRequirementSchema = z.object({
  prefab: z.string().min(1),
  craftAmount: z.number().int().nonnegative(),
  qualityAmount: z.number().int().nonnegative(),
  totalAmount: z.number().int().nonnegative(),
})

const itemStationRequirementSchema = z.discriminatedUnion("status", [
  z.object({
    itemPrefab: z.string().min(1),
    targetQuality: z.number().int().positive(),
    status: z.literal("required"),
    stationReference: z.string().min(1),
    stationPrefab: z.string().min(1),
    stationLevel: z.number().int().positive().optional(),
    outputAmountPerInput: z.number().int().positive().optional(),
  }),
  z.object({
    itemPrefab: z.string().min(1),
    targetQuality: z.number().int().positive(),
    status: z.literal("no-station-listed"),
  }),
  z.object({
    itemPrefab: z.string().min(1),
    targetQuality: z.number().int().positive(),
    status: z.literal("unresolved"),
    reason: stationRequirementReasonSchema,
    stationReference: z.string().min(1).optional(),
    stationPrefab: z.string().min(1).optional(),
    stationLevel: z.number().int().positive().optional(),
  }),
]) satisfies z.ZodType<ItemStationRequirement>

const unresolvedStationRequirementSchema = z.object({
  itemPrefab: z.string().min(1),
  targetQuality: z.number().int().positive(),
  status: z.literal("unresolved"),
  reason: stationRequirementReasonSchema,
  stationReference: z.string().min(1).optional(),
  stationPrefab: z.string().min(1).optional(),
  stationLevel: z.number().int().positive().optional(),
})

const calculationSnapshotSchema = z.object({
  kitId: z.string().min(1),
  inputFingerprint: z.string().min(1),
  sourceFingerprint: z.string().min(1),
  calculatedAt: z.string().datetime(),
  calculation: z.object({
    kitId: z.string().min(1),
    directRequirements: z.array(directRequirementSchema),
    leafRequirements: z.array(resourceRequirementSchema),
    unresolved: z.array(unresolvedRequirementSchema),
    limitations: z.array(z.string()),
    isComplete: z.boolean(),
  }),
  stationRequirements: z.object({
    kitId: z.string().min(1),
    itemRequirements: z.array(itemStationRequirementSchema),
  }),
  stationResources: z.object({
    stationResources: z.array(resourceRequirementSchema),
    unresolvedResources: z.array(unresolvedRequirementSchema),
    unresolvedStationRequirements: z.array(unresolvedStationRequirementSchema),
    unresolvedStations: z.array(
      z.object({
        stationPrefab: z.string().min(1),
        level: z.number().int().positive().optional(),
        reason: stationResourceIssueReasonSchema,
      })
    ),
    limitations: z.array(z.string()),
    isComplete: z.boolean(),
  }),
}) satisfies z.ZodType<KitCalculationSnapshot>

const calculationSnapshotCollectionSchema = z
  .object({
    version: z.literal(1),
    snapshots: z.record(z.string(), calculationSnapshotSchema),
  })
  .strict()

export type KitCalculationSnapshot = {
  kitId: string
  inputFingerprint: string
  sourceFingerprint: string
  calculatedAt: string
  calculation: KitResourceCalculation
  stationRequirements: {
    kitId: string
    itemRequirements: ItemStationRequirement[]
  }
  stationResources: StationResourceCalculation
}

export function isCalculationSnapshotStale(
  snapshot: Pick<
    KitCalculationSnapshot,
    "inputFingerprint" | "sourceFingerprint"
  >,
  inputFingerprint: string | null,
  sourceFingerprint: string | null
): boolean {
  return (
    inputFingerprint === null ||
    sourceFingerprint === null ||
    snapshot.inputFingerprint !== inputFingerprint ||
    snapshot.sourceFingerprint !== sourceFingerprint
  )
}

export type CalculationSnapshotCollection = z.infer<
  typeof calculationSnapshotCollectionSchema
>

export interface CalculationSnapshotStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface CalculationSnapshotLoadResult {
  snapshots: CalculationSnapshotCollection["snapshots"]
  warning: string | null
}

export type CalculationSnapshotSaveResult =
  { success: true } | { success: false; message: string }

export function createCalculationSnapshotCollection(
  snapshots: CalculationSnapshotCollection["snapshots"] = {}
): CalculationSnapshotCollection {
  return calculationSnapshotCollectionSchema.parse({ version: 1, snapshots })
}

export function upsertCalculationSnapshot(
  snapshots: CalculationSnapshotCollection["snapshots"],
  snapshot: KitCalculationSnapshot
): CalculationSnapshotCollection["snapshots"] {
  return createCalculationSnapshotCollection({
    ...snapshots,
    [snapshot.kitId]: snapshot,
  }).snapshots
}

export function removeCalculationSnapshot(
  snapshots: CalculationSnapshotCollection["snapshots"],
  kitId: string
): CalculationSnapshotCollection["snapshots"] {
  const nextSnapshots = { ...snapshots }
  delete nextSnapshots[kitId]
  return createCalculationSnapshotCollection(nextSnapshots).snapshots
}

export function loadCalculationSnapshots(
  storage?: CalculationSnapshotStorage
): CalculationSnapshotLoadResult {
  if (!storage) {
    return {
      snapshots: {},
      warning:
        "Browser storage is unavailable; calculations will not be saved.",
    }
  }

  try {
    const storedValue = storage.getItem(CALCULATION_SNAPSHOT_STORAGE_KEY)
    if (storedValue === null) return { snapshots: {}, warning: null }

    const parsed = calculationSnapshotCollectionSchema.safeParse(
      JSON.parse(storedValue)
    )
    if (!parsed.success) {
      return {
        snapshots: {},
        warning:
          "Saved calculations are invalid; recalculate kits to restore results.",
      }
    }

    return { snapshots: parsed.data.snapshots, warning: null }
  } catch {
    return {
      snapshots: {},
      warning:
        "Saved calculations could not be read; recalculate kits to restore results.",
    }
  }
}

export function saveCalculationSnapshots(
  storage: CalculationSnapshotStorage | undefined,
  snapshots: CalculationSnapshotCollection["snapshots"]
): CalculationSnapshotSaveResult {
  if (!storage) {
    return {
      success: false,
      message: "Browser storage is unavailable; calculations were not saved.",
    }
  }

  const parsed = calculationSnapshotCollectionSchema.safeParse({
    version: 1,
    snapshots,
  })
  if (!parsed.success) {
    return { success: false, message: "Calculation snapshots are invalid." }
  }

  try {
    storage.setItem(
      CALCULATION_SNAPSHOT_STORAGE_KEY,
      JSON.stringify(parsed.data)
    )
    return { success: true }
  } catch {
    return {
      success: false,
      message: "Calculations could not be saved in browser storage.",
    }
  }
}
