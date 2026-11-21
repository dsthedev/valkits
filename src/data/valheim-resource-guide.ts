import { z } from "zod"

export const acquisitionTypes = [
  "plants",
  "creatures",
  "mining",
  "loot",
  "processed",
] as const

const acquisitionTypeSchema = z.enum(acquisitionTypes)
export type AcquisitionType = z.infer<typeof acquisitionTypeSchema>

const resourceSchema = z.object({
  name: z.string().trim().min(1),
  source: z.string().trim().min(1),
  tip: z.string().trim().min(1),
  wikiUrl: z.string().url(),
  acquisitionTypes: z.array(acquisitionTypeSchema).default([]),
})

const categorySchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  note: z.string().optional(),
  storageNote: z.string().optional(),
  expeditionNote: z.string().optional(),
  resources: z.array(resourceSchema),
})

const guideSchema = z.object({
  categories: z.array(categorySchema).min(1),
})

export type ResourceGuide = z.infer<typeof guideSchema>
export type ResourceCategory = ResourceGuide["categories"][number]
export type ResourceSort = "guide" | "name-asc" | "name-desc" | "source"
export type AcquisitionFilter = AcquisitionType | "all" | "unclassified"

export interface ResourceFilterOptions {
  categoryId?: string
  acquisition?: AcquisitionFilter
  sort?: ResourceSort
}

export function filterResourceCategories(
  categories: readonly ResourceCategory[],
  query: string,
  options: ResourceFilterOptions = {}
): ResourceCategory[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const { categoryId = "all", acquisition = "all", sort = "guide" } = options
  const activeResourceFilter = Boolean(normalizedQuery) || acquisition !== "all"

  return categories
    .filter((category) => categoryId === "all" || category.id === categoryId)
    .map((category) => ({
      ...category,
      resources: category.resources
        .filter((resource) => {
          const matchesQuery =
            !normalizedQuery ||
            [resource.name, resource.source, resource.tip].some((value) =>
              value.toLocaleLowerCase().includes(normalizedQuery)
            )
          const matchesAcquisition =
            acquisition === "all" ||
            (acquisition === "unclassified"
              ? resource.acquisitionTypes.length === 0
              : resource.acquisitionTypes.includes(acquisition))
          return matchesQuery && matchesAcquisition
        })
        .sort((a, b) => {
          if (sort === "name-asc") return a.name.localeCompare(b.name)
          if (sort === "name-desc") return b.name.localeCompare(a.name)
          if (sort === "source") {
            return (
              a.source.localeCompare(b.source) || a.name.localeCompare(b.name)
            )
          }
          return 0
        }),
    }))
    .filter(
      (category) => !activeResourceFilter || category.resources.length > 0
    )
}

export function parseResourceGuide(value: unknown): ResourceGuide {
  const guide = guideSchema.parse(value)
  const categories = [...guide.categories]
  const generalIndex = categories.findIndex(
    (category) => category.id === "general"
  )

  if (generalIndex > 0) {
    categories.unshift(...categories.splice(generalIndex, 1))
  }

  return { categories }
}

export async function loadResourceGuide(
  signal?: AbortSignal
): Promise<ResourceGuide> {
  const response = await fetch(
    `${import.meta.env.BASE_URL}data/valheim-resource-guide.json`,
    { signal }
  )

  if (!response.ok) {
    throw new Error(`Resource guide request failed (${response.status}).`)
  }

  return parseResourceGuide(await response.json())
}
