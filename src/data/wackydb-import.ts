import { z } from "zod"
import { parse as parseYaml } from "yaml"
import {
  gameItemSchema,
  gameRecipeSchema,
  recipeRequirementSchema,
  type GameItem,
  type GameRecipe,
  type RecipeRequirement,
} from "../domain/schema"

const sourceRecordSchema = z.record(z.string(), z.unknown())
const requirementPattern = /^(.+):(\d+):(\d+):(true|false)$/i

const recipeCandidateSchema = z.object({
  sourceName: z.string().trim().min(1),
  outputAmount: z.number().int().positive(),
  craftingStation: z.string().trim().min(1).optional(),
  minStationLevel: z.number().int().positive().optional(),
  disabled: z.boolean().optional(),
  disabledUpgrade: z.boolean().optional(),
  noCraftOnlyUpgrade: z.boolean().optional(),
  requireOnlyOneIngredient: z.boolean().optional(),
  requirements: z.array(recipeRequirementSchema),
  upgradeRequirements: z.array(recipeRequirementSchema).optional(),
})

export type ImportResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] }

export type RecipeCandidate = z.infer<typeof recipeCandidateSchema>

function failure<T>(message: string): ImportResult<T> {
  return { success: false, errors: [message] }
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "record"
    return `${path}: ${issue.message}`
  })
}

function parseSourceRecord(yamlText: string): ImportResult<Record<string, unknown>> {
  let parsedYaml: unknown

  try {
    parsedYaml = parseYaml(yamlText)
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Invalid YAML")
  }

  const parsedRecord = sourceRecordSchema.safeParse(parsedYaml)
  if (!parsedRecord.success) {
    return { success: false, errors: formatIssues(parsedRecord.error) }
  }

  return { success: true, data: parsedRecord.data }
}

function optionalSourceValue(value: unknown): unknown {
  return value === null || value === "" ? undefined : value
}

function parseRequirements(
  value: unknown,
  fieldName: string,
): ImportResult<RecipeRequirement[]> {
  if (!Array.isArray(value)) {
    return failure(`${fieldName}: expected a YAML list of requirement strings`)
  }

  const requirements: RecipeRequirement[] = []

  for (const [index, rawRequirement] of value.entries()) {
    if (typeof rawRequirement !== "string") {
      return failure(`${fieldName}[${index}]: expected a requirement string`)
    }

    const match = requirementPattern.exec(rawRequirement)
    if (!match) {
      return failure(`${fieldName}[${index}]: malformed requirement "${rawRequirement}"`)
    }

    const requirement = recipeRequirementSchema.safeParse({
      prefab: match[1],
      amount: Number(match[2]),
      amountPerLevel: Number(match[3]),
      recover: match[4]?.toLowerCase() === "true",
    })

    if (!requirement.success) {
      return {
        success: false,
        errors: requirement.error.issues.map(
          (issue) => `${fieldName}[${index}]: ${issue.message}`,
        ),
      }
    }

    requirements.push(requirement.data)
  }

  return { success: true, data: requirements }
}

export function parseItemYaml(yamlText: string): ImportResult<GameItem> {
  const source = parseSourceRecord(yamlText)
  if (!source.success) return source

  const item = gameItemSchema.safeParse({
    prefab: source.data.name,
    nameToken: source.data.m_name,
    descriptionToken: optionalSourceValue(source.data.m_description),
    itemType: optionalSourceValue(source.data.m_itemType),
    maxStackSize: optionalSourceValue(source.data.m_maxStackSize),
    maxQuality: optionalSourceValue(source.data.m_maxQuality),
  })

  if (!item.success) {
    return { success: false, errors: formatIssues(item.error) }
  }

  return { success: true, data: item.data }
}

export function parseRecipeYaml(yamlText: string): ImportResult<RecipeCandidate> {
  const source = parseSourceRecord(yamlText)
  if (!source.success) return source

  const requirements = parseRequirements(source.data.reqs, "reqs")
  if (!requirements.success) return requirements

  const rawUpgradeRequirements = optionalSourceValue(source.data.upgrade_reqs)
  let upgradeRequirements: RecipeRequirement[] | undefined
  if (rawUpgradeRequirements !== undefined) {
    const parsedUpgradeRequirements = parseRequirements(
      rawUpgradeRequirements,
      "upgrade_reqs",
    )
    if (!parsedUpgradeRequirements.success) return parsedUpgradeRequirements
    upgradeRequirements = parsedUpgradeRequirements.data
  }

  const candidate = recipeCandidateSchema.safeParse({
    sourceName: source.data.name,
    outputAmount: source.data.amount,
    craftingStation: optionalSourceValue(source.data.craftingStation),
    minStationLevel: optionalSourceValue(source.data.minStationLevel),
    disabled: optionalSourceValue(source.data.disabled),
    disabledUpgrade: optionalSourceValue(source.data.disabledUpgrade),
    noCraftOnlyUpgrade: optionalSourceValue(source.data.m_noCraftOnlyUpgrade),
    requireOnlyOneIngredient: optionalSourceValue(
      source.data.requireOnlyOneIngredient,
    ),
    requirements: requirements.data,
    upgradeRequirements,
  })

  if (!candidate.success) {
    return { success: false, errors: formatIssues(candidate.error) }
  }

  return { success: true, data: candidate.data }
}

export function linkRecipeResult(
  candidate: RecipeCandidate,
  itemsByPrefab: ReadonlyMap<string, GameItem>,
): ImportResult<GameRecipe> {
  const item = itemsByPrefab.get(candidate.sourceName)
  if (!item) {
    return failure(
      `No item prefab matches recipe name "${candidate.sourceName}".`,
    )
  }

  const recipe = gameRecipeSchema.safeParse({
    resultPrefab: item.prefab,
    outputAmount: candidate.outputAmount,
    craftingStation: candidate.craftingStation,
    minStationLevel: candidate.minStationLevel,
    disabled: candidate.disabled,
    disabledUpgrade: candidate.disabledUpgrade,
    noCraftOnlyUpgrade: candidate.noCraftOnlyUpgrade,
    requireOnlyOneIngredient: candidate.requireOnlyOneIngredient,
    requirements: candidate.requirements,
    upgradeRequirements: candidate.upgradeRequirements,
  })

  if (!recipe.success) {
    return { success: false, errors: formatIssues(recipe.error) }
  }

  return { success: true, data: recipe.data }
}