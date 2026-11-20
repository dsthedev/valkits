import { z } from "zod"

export const FAVORITES_STORAGE_KEY = "valkits.favorites.v1"

const favoritesSchema = z
  .object({
    version: z.literal(1),
    prefabs: z.array(z.string().trim().min(1)),
  })
  .strict()
  .transform((favorites) => ({
    version: favorites.version,
    prefabs: [...new Set(favorites.prefabs)],
  }))

export interface FavoritesStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface FavoriteLoadResult {
  prefabs: string[]
  warning: string | null
}

export type FavoriteSaveResult =
  | { success: true }
  | { success: false; message: string }

export function loadFavoritePrefabs(
  storage?: FavoritesStorage,
): FavoriteLoadResult {
  if (!storage) {
    return {
      prefabs: [],
      warning: "Browser storage is unavailable; favorites will not be saved.",
    }
  }

  try {
    const storedValue = storage.getItem(FAVORITES_STORAGE_KEY)
    if (storedValue === null) return { prefabs: [], warning: null }

    const parsed = favoritesSchema.safeParse(JSON.parse(storedValue))
    if (!parsed.success) {
      return {
        prefabs: [],
        warning: "Saved favorites are invalid; using an empty list for now.",
      }
    }

    return { prefabs: parsed.data.prefabs, warning: null }
  } catch {
    return {
      prefabs: [],
      warning: "Saved favorites could not be read; using an empty list for now.",
    }
  }
}

export function saveFavoritePrefabs(
  storage: FavoritesStorage | undefined,
  prefabs: readonly string[],
): FavoriteSaveResult {
  if (!storage) {
    return {
      success: false,
      message: "Browser storage is unavailable; favorites were not saved.",
    }
  }

  const parsed = favoritesSchema.safeParse({ version: 1, prefabs })
  if (!parsed.success) {
    return { success: false, message: "Favorite item IDs are invalid." }
  }

  try {
    storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(parsed.data))
    return { success: true }
  } catch {
    return {
      success: false,
      message: "Favorites could not be saved in browser storage.",
    }
  }
}

export function prioritizeFavorites<T extends { prefab: string }>(
  items: readonly T[],
  favoritePrefabs: ReadonlySet<string>,
): T[] {
  return [...items].sort(
    (left, right) =>
      Number(favoritePrefabs.has(right.prefab)) -
      Number(favoritePrefabs.has(left.prefab)),
  )
}