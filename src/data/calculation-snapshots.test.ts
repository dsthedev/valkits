import { describe, expect, it } from "vitest"
import {
  CALCULATION_SNAPSHOT_STORAGE_KEY,
  createCalculationSnapshotCollection,
  isCalculationSnapshotStale,
  loadCalculationSnapshots,
  removeCalculationSnapshot,
  saveCalculationSnapshots,
  upsertCalculationSnapshot,
  type CalculationSnapshotStorage,
  type KitCalculationSnapshot,
} from "./calculation-snapshots"

class MemoryStorage implements CalculationSnapshotStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

function snapshot(kitId: string): KitCalculationSnapshot {
  return {
    kitId,
    inputFingerprint: `inputs-${kitId}`,
    sourceFingerprint: "source-1",
    calculatedAt: "2026-11-19T12:00:00.000Z",
    calculation: {
      kitId,
      directRequirements: [],
      leafRequirements: [],
      unresolved: [],
      limitations: [],
      isComplete: true,
    },
    stationRequirements: { kitId, itemRequirements: [] },
    stationResources: {
      stationResources: [],
      unresolvedResources: [],
      unresolvedStationRequirements: [],
      unresolvedStations: [],
      limitations: [],
      isComplete: true,
    },
  }
}

describe("calculation snapshots", () => {
  it("round-trips validated per-kit snapshots", () => {
    const storage = new MemoryStorage()
    const snapshots = upsertCalculationSnapshot({}, snapshot("kit-1"))

    expect(saveCalculationSnapshots(storage, snapshots)).toEqual({
      success: true,
    })
    expect(loadCalculationSnapshots(storage)).toEqual({
      snapshots,
      warning: null,
    })
    expect(storage.getItem(CALCULATION_SNAPSHOT_STORAGE_KEY)).not.toBeNull()
  })

  it("recovers safely from malformed or outdated snapshots", () => {
    const storage = new MemoryStorage()
    storage.setItem(CALCULATION_SNAPSHOT_STORAGE_KEY, "not-json")

    expect(loadCalculationSnapshots(storage)).toEqual({
      snapshots: {},
      warning:
        "Saved calculations could not be read; recalculate kits to restore results.",
    })
  })

  it("upserts and removes only the requested kit snapshot", () => {
    const snapshots = upsertCalculationSnapshot(
      upsertCalculationSnapshot({}, snapshot("kit-1")),
      snapshot("kit-2")
    )

    expect(removeCalculationSnapshot(snapshots, "kit-1")).toEqual({
      "kit-2": snapshot("kit-2"),
    })
  })

  it("detects stale kit inputs or game data while keeping matching inputs current", () => {
    const savedSnapshot = snapshot("kit-1")

    expect(
      isCalculationSnapshotStale(
        savedSnapshot,
        savedSnapshot.inputFingerprint,
        savedSnapshot.sourceFingerprint
      )
    ).toBe(false)
    expect(
      isCalculationSnapshotStale(
        savedSnapshot,
        "changed-inputs",
        savedSnapshot.sourceFingerprint
      )
    ).toBe(true)
    expect(
      isCalculationSnapshotStale(
        savedSnapshot,
        savedSnapshot.inputFingerprint,
        "changed-source"
      )
    ).toBe(true)
    expect(
      isCalculationSnapshotStale(
        savedSnapshot,
        null,
        savedSnapshot.sourceFingerprint
      )
    ).toBe(true)
  })

  it("does not persist malformed snapshot records", () => {
    const storage = new MemoryStorage()
    const result = saveCalculationSnapshots(storage, {
      broken: { kitId: "broken" } as KitCalculationSnapshot,
    })

    expect(result).toEqual({
      success: false,
      message: "Calculation snapshots are invalid.",
    })
  })

  it("creates a valid empty collection", () => {
    expect(createCalculationSnapshotCollection()).toEqual({
      version: 1,
      snapshots: {},
    })
  })
})
