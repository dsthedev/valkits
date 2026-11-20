import { z } from "zod"
import {
  biomeSchema,
  kitSchema,
  type Biome,
  type Kit,
  type KitItemGoal,
} from "../domain/schema"

export const KIT_STORAGE_KEY = "valkits.kits.v1"
export const MAX_KIT_IMPORT_LENGTH = 1_000_000

const kitExportSchema = z
  .object({
    version: z.literal(1),
    kit: kitSchema,
  })
  .strict()

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
export type KitExport = z.infer<typeof kitExportSchema>
export interface ExampleKitOption {
  id: string
  name: string
  biome: Biome
}

const exampleKitOptionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(1),
    biome: biomeSchema,
  })
  .strict()

const exampleKitCatalogSchema = z
  .object({
    version: z.literal(1),
    examples: z.array(exampleKitOptionSchema),
  })
  .strict()

function exampleDataUrl(fileName: string): string {
  return `${import.meta.env.BASE_URL}data/examples/${fileName}`
}

async function fetchExampleJson(
  fileName: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const response = await fetcher(exampleDataUrl(fileName))
  if (!response.ok) {
    throw new Error(`Unable to load example kit data (${response.status}).`)
  }
  return response.json()
}

export async function loadExampleKitOptions(
  fetcher: typeof fetch = fetch,
): Promise<ExampleKitOption[]> {
  const catalog = exampleKitCatalogSchema.safeParse(
    await fetchExampleJson("catalog.json", fetcher),
  )
  if (!catalog.success) {
    throw new Error("Example kit catalog is invalid.")
  }
  return catalog.data.examples
}

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

export interface ItemGoalUpdates {
  quantity?: number | null
  targetQuality?: number | null
}

export function createKitCollection(
  kits: readonly Kit[] = [],
  activeKitId: string | null = null,
): KitCollection {
  return kitCollectionSchema.parse({ version: 1, activeKitId, kits })
}

export function createKit(id: string, name: string, biome: Biome): Kit {
  return kitSchema.parse({ id, name, biome, itemGoals: [] })
}

export function createKitId(): string {
  const randomUUID = globalThis.crypto?.randomUUID
  if (typeof randomUUID === "function") {
    return randomUUID.call(globalThis.crypto)
  }

  return `kit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export async function createExampleKit(
  exampleId: string,
  fetcher: typeof fetch = fetch,
): Promise<Kit> {
  const validId = exampleKitOptionSchema.shape.id.safeParse(exampleId)
  if (!validId.success) {
    throw new Error(`Unknown example kit "${exampleId}".`)
  }

  let exportedKit: unknown
  try {
    exportedKit = await fetchExampleJson(`${validId.data}.json`, fetcher)
  } catch {
    throw new Error(`Unknown example kit "${exampleId}".`)
  }

  const parsed = kitExportSchema.safeParse(exportedKit)
  if (!parsed.success) {
    throw new Error("Example kit data is invalid.")
  }

  return kitSchema.parse({ ...parsed.data.kit, id: createKitId() })
}

export type KitImportResult =
  | { success: true; kit: Kit }
  | { success: false; message: string }

export function parseKitExport(text: string): KitImportResult {
  if (text.length > MAX_KIT_IMPORT_LENGTH) {
    return { success: false, message: "The kit file is too large." }
  }

  try {
    const parsed = kitExportSchema.safeParse(JSON.parse(text))
    if (!parsed.success) {
      return {
        success: false,
        message: "The file is not a supported Valkits kit export.",
      }
    }

    return { success: true, kit: parsed.data.kit }
  } catch {
    return { success: false, message: "The kit file is not valid JSON." }
  }
}

export function serializeKitExport(kit: Kit): string {
  return `${JSON.stringify(kitExportSchema.parse({ version: 1, kit }), null, 2)}\n`
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

export function addExampleKitsToCollection(
  collection: KitCollection,
  exampleKits: readonly Kit[],
): KitCollection {
  const contentKey = (kit: Kit) =>
    `${kit.name}\0${kit.biome}\0${JSON.stringify(kit.itemGoals)}`
  const existingKeys = new Set(collection.kits.map(contentKey))
  const additions = exampleKits.filter((kit) => {
    const key = contentKey(kit)
    if (existingKeys.has(key)) return false
    existingKeys.add(key)
    return true
  })

  return createKitCollection(
    [...collection.kits, ...additions],
    collection.activeKitId ?? additions[0]?.id ?? null,
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

export function reorderItemGoals(
  kit: Kit,
  orderedPrefabs: readonly string[],
): Kit {
  const orderedSet = new Set(orderedPrefabs)
  const goalsByPrefab = new Map(
    kit.itemGoals.map((goal) => [goal.prefab, goal] as const),
  )
  if (
    orderedSet.size !== orderedPrefabs.length ||
    orderedPrefabs.some((prefab) => !goalsByPrefab.has(prefab))
  ) {
    return kit
  }

  let orderedIndex = 0
  const itemGoals = kit.itemGoals.map((goal) => {
    if (!orderedSet.has(goal.prefab)) return goal
    const reorderedGoal = goalsByPrefab.get(orderedPrefabs[orderedIndex++]!)
    return reorderedGoal ?? goal
  })
  return kitSchema.parse({ ...kit, itemGoals })
}

export function updateItemGoal(
  kit: Kit,
  prefab: string,
  updates: ItemGoalUpdates,
): Kit {
  const goalIndex = kit.itemGoals.findIndex((goal) => goal.prefab === prefab)
  if (goalIndex < 0) return kit

  const nextGoal: KitItemGoal = { ...kit.itemGoals[goalIndex] }
  if ("quantity" in updates) {
    if (updates.quantity === null) delete nextGoal.quantity
    else nextGoal.quantity = updates.quantity
  }
  if ("targetQuality" in updates) {
    if (updates.targetQuality === null) delete nextGoal.targetQuality
    else nextGoal.targetQuality = updates.targetQuality
  }

  const itemGoals = [...kit.itemGoals]
  itemGoals[goalIndex] = nextGoal
  return kitSchema.parse({ ...kit, itemGoals })
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