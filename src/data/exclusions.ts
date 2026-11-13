import { z } from "zod"

export const EXCLUSION_STORAGE_KEY = "valkits.exclusions.v1"
export const MAX_EXCLUSION_IMPORT_LENGTH = 1_000_000

const exclusionSettingsSchema = z
  .object({
    version: z.literal(1),
    excludedPrefabs: z.array(z.string().trim().min(1)),
  })
  .strict()
  .transform((settings) => ({
    version: settings.version,
    excludedPrefabs: [...new Set(settings.excludedPrefabs)].sort(),
  }))

export type ExclusionSettings = z.infer<typeof exclusionSettingsSchema>

export interface ExclusionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface ExclusionLoadResult {
  settings: ExclusionSettings
  warning: string | null
}

export type ExclusionImportResult =
  | { success: true; settings: ExclusionSettings }
  | { success: false; message: string }

export type ExclusionSaveResult =
  | { success: true }
  | { success: false; message: string }

export function createExclusionSettings(
  excludedPrefabs: readonly string[] = [],
): ExclusionSettings {
  return exclusionSettingsSchema.parse({ version: 1, excludedPrefabs })
}

export function setPrefabExcluded(
  settings: ExclusionSettings,
  prefab: string,
  excluded: boolean,
): ExclusionSettings {
  const excludedPrefabs = new Set(settings.excludedPrefabs)
  if (excluded) {
    excludedPrefabs.add(prefab)
  } else {
    excludedPrefabs.delete(prefab)
  }

  return createExclusionSettings([...excludedPrefabs])
}

export function filterExcludedItems<T extends { prefab: string }>(
  items: readonly T[],
  settings: ExclusionSettings,
  includeExcluded: boolean,
): T[] {
  if (includeExcluded) return [...items]

  const excludedPrefabs = new Set(settings.excludedPrefabs)
  return items.filter((item) => !excludedPrefabs.has(item.prefab))
}

export function loadExclusionSettings(
  storage?: ExclusionStorage,
): ExclusionLoadResult {
  if (!storage) {
    return {
      settings: createExclusionSettings(),
      warning: "Browser storage is unavailable; exclusions will not be saved.",
    }
  }

  try {
    const storedValue = storage.getItem(EXCLUSION_STORAGE_KEY)
    if (storedValue === null) {
      return { settings: createExclusionSettings(), warning: null }
    }

    const parsed = exclusionSettingsSchema.safeParse(JSON.parse(storedValue))
    if (!parsed.success) {
      return {
        settings: createExclusionSettings(),
        warning: "Saved exclusions are invalid; using an empty list for now.",
      }
    }

    return { settings: parsed.data, warning: null }
  } catch {
    return {
      settings: createExclusionSettings(),
      warning: "Saved exclusions could not be read; using an empty list for now.",
    }
  }
}

export function saveExclusionSettings(
  storage: ExclusionStorage | undefined,
  settings: ExclusionSettings,
): ExclusionSaveResult {
  if (!storage) {
    return {
      success: false,
      message: "Browser storage is unavailable; exclusions were not saved.",
    }
  }

  const parsed = exclusionSettingsSchema.safeParse(settings)
  if (!parsed.success) {
    return { success: false, message: "Exclusion settings are invalid." }
  }

  try {
    storage.setItem(EXCLUSION_STORAGE_KEY, JSON.stringify(parsed.data))
    return { success: true }
  } catch {
    return {
      success: false,
      message: "Exclusions could not be saved in browser storage.",
    }
  }
}

export function parseExclusionExport(text: string): ExclusionImportResult {
  if (text.length > MAX_EXCLUSION_IMPORT_LENGTH) {
    return { success: false, message: "The exclusions file is too large." }
  }

  try {
    const parsed = exclusionSettingsSchema.safeParse(JSON.parse(text))
    if (!parsed.success) {
      return {
        success: false,
        message: "The file is not a supported Valkits exclusions export.",
      }
    }

    return { success: true, settings: parsed.data }
  } catch {
    return { success: false, message: "The exclusions file is not valid JSON." }
  }
}

export function serializeExclusionExport(settings: ExclusionSettings): string {
  return `${JSON.stringify(exclusionSettingsSchema.parse(settings), null, 2)}\n`
}