import { z } from "zod"

const resourceSchema = z.object({
  name: z.string().trim().min(1),
  source: z.string().trim().min(1),
  tip: z.string().trim().min(1),
  wikiUrl: z.string().url(),
})

const categorySchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  note: z.string().optional(),
  resources: z.array(resourceSchema),
})

const guideSchema = z.object({
  categories: z.array(categorySchema).min(1),
})

export type ResourceGuide = z.infer<typeof guideSchema>
export type ResourceCategory = ResourceGuide["categories"][number]

export function filterResourceCategories(
  categories: readonly ResourceCategory[],
  query: string
): ResourceCategory[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return categories.map((category) => category)

  return categories
    .map((category) => ({
      ...category,
      resources: category.resources.filter((resource) =>
        [resource.name, resource.source, resource.tip].some((value) =>
          value.toLocaleLowerCase().includes(normalizedQuery)
        )
      ),
    }))
    .filter((category) => category.resources.length > 0)
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
