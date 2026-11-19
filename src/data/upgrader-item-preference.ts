import { z } from "zod"

export const UPGRADER_ITEM_PREFERENCE_STORAGE_KEY =
  "valkits.upgrader-items.v1"

const upgraderItemPreferenceSchema = z
  .object({
    version: z.literal(1),
    hideUpgraderItems: z.boolean(),
  })
  .strict()

export type UpgraderItemPreference = z.infer<
  typeof upgraderItemPreferenceSchema
>

export interface UpgraderItemPreferenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface UpgraderItemPreferenceLoadResult {
  hideUpgraderItems: boolean
  warning: string | null
}

export type UpgraderItemPreferenceSaveResult =
  | { success: true }
  | { success: false; message: string }

export function loadUpgraderItemPreference(
  storage?: UpgraderItemPreferenceStorage,
): UpgraderItemPreferenceLoadResult {
  if (!storage) {
    return {
      hideUpgraderItems: true,
      warning: "Browser storage is unavailable; this preference will not be saved.",
    }
  }

  try {
    const storedValue = storage.getItem(UPGRADER_ITEM_PREFERENCE_STORAGE_KEY)
    if (storedValue === null) {
      return { hideUpgraderItems: true, warning: null }
    }

    const parsed = upgraderItemPreferenceSchema.safeParse(
      JSON.parse(storedValue),
    )
    if (!parsed.success) {
      return {
        hideUpgraderItems: true,
        warning:
          "Saved upgrader-item preference is invalid; hiding upgrader armor/weapon items.",
      }
    }

    return {
      hideUpgraderItems: parsed.data.hideUpgraderItems,
      warning: null,
    }
  } catch {
    return {
      hideUpgraderItems: true,
      warning:
        "Saved upgrader-item preference could not be read; hiding upgrader armor/weapon items.",
    }
  }
}

export function saveUpgraderItemPreference(
  storage: UpgraderItemPreferenceStorage | undefined,
  hideUpgraderItems: boolean,
): UpgraderItemPreferenceSaveResult {
  if (!storage) {
    return {
      success: false,
      message: "Browser storage is unavailable; this preference was not saved.",
    }
  }

  const parsed = upgraderItemPreferenceSchema.safeParse({
    version: 1,
    hideUpgraderItems,
  })
  if (!parsed.success) {
    return { success: false, message: "Upgrader-item preference is invalid." }
  }

  try {
    storage.setItem(
      UPGRADER_ITEM_PREFERENCE_STORAGE_KEY,
      JSON.stringify(parsed.data),
    )
    return { success: true }
  } catch {
    return {
      success: false,
      message: "Upgrader-item preference could not be saved in browser storage.",
    }
  }
}
