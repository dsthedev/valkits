import { z } from "zod"

export const COLLECTED_RESOURCES_STORAGE_KEY = "valkits.collected-resources.v1"

const collectedResourcesSchema = z
  .object({
    version: z.literal(1),
    kits: z.array(
      z
        .object({
          kitId: z.string().trim().min(1),
          prefabs: z.array(z.string().trim().min(1)),
        })
        .strict()
    ),
  })
  .strict()
  .transform((collection) => ({
    version: collection.version,
    kits: collection.kits.map((kit) => ({
      kitId: kit.kitId,
      prefabs: [...new Set(kit.prefabs)],
    })),
  }))

export interface CollectedResourcesStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface CollectedResourcesLoadResult {
  prefabsByKit: Record<string, string[]>
  warning: string | null
}

export type CollectedResourcesSaveResult =
  | { success: true }
  | { success: false; message: string }

export function loadCollectedResources(
  storage?: CollectedResourcesStorage
): CollectedResourcesLoadResult {
  if (!storage) {
    return {
      prefabsByKit: {},
      warning:
        "Browser storage is unavailable; collected resources will not be saved.",
    }
  }

  try {
    const storedValue = storage.getItem(COLLECTED_RESOURCES_STORAGE_KEY)
    if (storedValue === null) return { prefabsByKit: {}, warning: null }

    const parsed = collectedResourcesSchema.safeParse(JSON.parse(storedValue))
    if (!parsed.success) {
      return {
        prefabsByKit: {},
        warning:
          "Saved collected resources are invalid; using an empty list for now.",
      }
    }

    return {
      prefabsByKit: Object.fromEntries(
        parsed.data.kits.map(({ kitId, prefabs }) => [kitId, prefabs])
      ),
      warning: null,
    }
  } catch {
    return {
      prefabsByKit: {},
      warning:
        "Saved collected resources could not be read; using an empty list for now.",
    }
  }
}

export function saveCollectedResources(
  storage: CollectedResourcesStorage | undefined,
  kitId: string,
  prefabs: readonly string[]
): CollectedResourcesSaveResult {
  if (!storage) {
    return {
      success: false,
      message:
        "Browser storage is unavailable; collected resources were not saved.",
    }
  }

  const parsedKit = z
    .object({
      kitId: z.string().trim().min(1),
      prefabs: z.array(z.string().trim().min(1)),
    })
    .strict()
    .safeParse({ kitId, prefabs })
  if (!parsedKit.success) {
    return { success: false, message: "Collected resource data is invalid." }
  }

  const current = loadCollectedResources(storage)
  const prefabsByKit = {
    ...current.prefabsByKit,
    [parsedKit.data.kitId]: [...new Set(parsedKit.data.prefabs)],
  }
  const data = collectedResourcesSchema.safeParse({
    version: 1,
    kits: Object.entries(prefabsByKit)
      .filter(([, kitPrefabs]) => kitPrefabs.length > 0)
      .map(([storedKitId, kitPrefabs]) => ({
        kitId: storedKitId,
        prefabs: kitPrefabs,
      })),
  })
  if (!data.success) {
    return { success: false, message: "Collected resource data is invalid." }
  }

  try {
    storage.setItem(COLLECTED_RESOURCES_STORAGE_KEY, JSON.stringify(data.data))
    return { success: true }
  } catch {
    return {
      success: false,
      message: "Collected resources could not be saved in browser storage.",
    }
  }
}
