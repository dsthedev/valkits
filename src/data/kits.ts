import { z } from "zod"
import {
  biomeSchema,
  kitSchema,
  type Biome,
  type Kit,
} from "../domain/schema"

export const KIT_STORAGE_KEY = "valkits.kits.v1"

const kitCollectionSchema = z
  .object({
    version: z.literal(1),
    activeKitId: z.string().trim().min(1).nullable(),
    kits: z.array(kitSchema),
  })
  .strict()
  .superRefine((collection, context) => {
    const kitIds = new Set<string>()

    collection.kits.forEach((kit, index) => {
      if (kitIds.has(kit.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate kit ID "${kit.id}".`,
          path: ["kits", index, "id"],
        })
      }
      kitIds.add(kit.id)
    })

    if (collection.activeKitId && !kitIds.has(collection.activeKitId)) {
      context.addIssue({
        code: "custom",
        message: "The active kit must exist in the collection.",
        path: ["activeKitId"],
      })
    }
  })

export type KitCollection = z.infer<typeof kitCollectionSchema>

export interface KitStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface KitLoadResult {
  collection: KitCollection
  warning: string | null
}

export type KitSaveResult =
  | { success: true }
  | { success: false; message: string }

export function createKitCollection(
  kits: readonly Kit[] = [],
  activeKitId: string | null = null,
): KitCollection {
  return kitCollectionSchema.parse({ version: 1, activeKitId, kits })
}

export function createKit(id: string, name: string, biome: Biome): Kit {
  return kitSchema.parse({ id, name, biome, itemGoals: [] })
}

export function addKitToCollection(
  collection: KitCollection,
  kit: Kit,
): KitCollection {
  return createKitCollection(
    [...collection.kits, kit],
    collection.activeKitId ?? kit.id,
  )
}

export function selectKit(
  collection: KitCollection,
  kitId: string | null,
): KitCollection {
  return createKitCollection(collection.kits, kitId)
}

export function updateKitInCollection(
  collection: KitCollection,
  updatedKit: Kit,
): KitCollection {
  if (!collection.kits.some((kit) => kit.id === updatedKit.id)) {
    return collection
  }

  return createKitCollection(
    collection.kits.map((kit) =>
      kit.id === updatedKit.id ? updatedKit : kit,
    ),
    collection.activeKitId,
  )
}

export function updateKitDetails(
  kit: Kit,
  name: string,
  biome: Biome,
): Kit {
  return kitSchema.parse({ ...kit, name, biome })
}

export function addItemGoal(kit: Kit, prefab: string): Kit {
  if (kit.itemGoals.some((goal) => goal.prefab === prefab)) return kit

  return kitSchema.parse({
    ...kit,
    itemGoals: [...kit.itemGoals, { prefab }],
  })
}

export function removeItemGoal(kit: Kit, prefab: string): Kit {
  return kitSchema.parse({
    ...kit,
    itemGoals: kit.itemGoals.filter((goal) => goal.prefab !== prefab),
  })
}

export function removeKitFromCollection(
  collection: KitCollection,
  kitId: string,
): KitCollection {
  const kits = collection.kits.filter((kit) => kit.id !== kitId)
  const activeKitId =
    collection.activeKitId === kitId
      ? (kits[0]?.id ?? null)
      : collection.activeKitId

  return createKitCollection(kits, activeKitId)
}

export function loadKitCollection(storage?: KitStorage): KitLoadResult {
  if (!storage) {
    return {
      collection: createKitCollection(),
      warning: "Browser storage is unavailable; kits will not be saved.",
    }
  }

  try {
    const storedValue = storage.getItem(KIT_STORAGE_KEY)
    if (storedValue === null) {
      return { collection: createKitCollection(), warning: null }
    }

    const parsed = kitCollectionSchema.safeParse(JSON.parse(storedValue))
    if (!parsed.success) {
      return {
        collection: createKitCollection(),
        warning: "Saved kits are invalid; using an empty collection for now.",
      }
    }

    return { collection: parsed.data, warning: null }
  } catch {
    return {
      collection: createKitCollection(),
      warning: "Saved kits could not be read; using an empty collection for now.",
    }
  }
}

export function saveKitCollection(
  storage: KitStorage | undefined,
  collection: KitCollection,
): KitSaveResult {
  if (!storage) {
    return {
      success: false,
      message: "Browser storage is unavailable; kits were not saved.",
    }
  }

  const parsed = kitCollectionSchema.safeParse(collection)
  if (!parsed.success) {
    return { success: false, message: "Kit collection is invalid." }
  }

  try {
    storage.setItem(KIT_STORAGE_KEY, JSON.stringify(parsed.data))
    return { success: true }
  } catch {
    return {
      success: false,
      message: "Kits could not be saved in browser storage.",
    }
  }
}

export function isBiome(value: string): value is Biome {
  return biomeSchema.safeParse(value).success
}