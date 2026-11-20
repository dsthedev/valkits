import { z } from "zod"
import { parse as parseYaml } from "yaml"
import {
  gameItemSchema,
  gamePieceSchema,
  gameProcessingConversionSchema,
  gameRecipeSchema,
  recipeRequirementSchema,
  type GameItem,
  type GamePiece,
  type GameProcessingConversion,
  type GameRecipe,
  type RecipeRequirement,
} from "../domain/schema"
import { getStationUpgradeLevel } from "../domain/station-upgrade-paths"

const sourceRecordSchema = z.record(z.string(), z.unknown())
const requirementPattern = /^(.+):(\d+):(\d+):(true|false)$/i
const verifiedRecipeResultAliases = new Map([["Recipe_Blacksoup", "BlackSoup"]])

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

function sourceGroup(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
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

  const foodStats = sourceGroup(source.data.FoodStats)
  const armorStats = sourceGroup(source.data.Armor)
  const shieldStats = sourceGroup(source.data.ShieldStats)

  const item = gameItemSchema.safeParse({
    prefab: source.data.name,
    nameToken: source.data.m_name,
    descriptionToken: optionalSourceValue(source.data.m_description),
    itemType: optionalSourceValue(source.data.m_itemType),
    maxStackSize: optionalSourceValue(source.data.m_maxStackSize),
    maxQuality: optionalSourceValue(source.data.m_maxQuality),
    foodStats: foodStats
      ? {
          health: optionalSourceValue(foodStats.m_foodHealth),
          stamina: optionalSourceValue(foodStats.m_foodStamina),
          eitr: optionalSourceValue(foodStats.m_FoodEitr),
        }
      : undefined,
    armorStats: armorStats
      ? {
          armor: optionalSourceValue(armorStats.armor),
          armorPerLevel: optionalSourceValue(armorStats.armorPerLevel),
        }
      : undefined,
    shieldStats: shieldStats
      ? {
          blockPower: optionalSourceValue(shieldStats.m_blockPower),
          blockPowerPerLevel: optionalSourceValue(
            shieldStats.m_blockPowerPerLevel,
          ),
          deflectionForce: optionalSourceValue(shieldStats.m_deflectionForce),
          deflectionForcePerLevel: optionalSourceValue(
            shieldStats.m_deflectionForcePerLevel,
          ),
          timedBlockBonus: optionalSourceValue(shieldStats.m_timedBlockBonus),
        }
      : undefined,
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

export function parsePieceYaml(yamlText: string): ImportResult<GamePiece> {
  const source = parseSourceRecord(yamlText)
  if (!source.success) return source

  const requirements = parseRequirements(source.data.build ?? [], "build")
  if (!requirements.success) return requirements

  const upgradeStation = Array.isArray(source.data.cSExtensionDataList)
    ? source.data.cSExtensionDataList.find(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null && !Array.isArray(entry),
      )?.MainCraftingStationName
    : undefined
  const fermentationStation = source.data.fermStationData
  let processingConversions: GameProcessingConversion[] | undefined
  if (fermentationStation !== undefined && fermentationStation !== null) {
    if (
      typeof fermentationStation !== "object" ||
      Array.isArray(fermentationStation)
    ) {
      return failure("fermStationData: expected an object")
    }

    const rawConversions = (
      fermentationStation as Record<string, unknown>
    ).fermConversion
    if (rawConversions !== undefined && rawConversions !== null) {
      if (!Array.isArray(rawConversions)) {
        return failure("fermStationData.fermConversion: expected a YAML list")
      }

      processingConversions = []
      for (const [index, rawConversion] of rawConversions.entries()) {
        if (
          typeof rawConversion !== "object" ||
          rawConversion === null ||
          Array.isArray(rawConversion)
        ) {
          return failure(
            `fermStationData.fermConversion[${index}]: expected an object`,
          )
        }

        const sourceConversion = rawConversion as Record<string, unknown>
        const conversion = gameProcessingConversionSchema.safeParse({
          inputPrefab: sourceConversion.FromName,
          resultPrefab: sourceConversion.ToName,
          outputAmount: sourceConversion.Amount,
          removeInput: sourceConversion.Remove,
        })
        if (!conversion.success) {
          return {
            success: false,
            errors: conversion.error.issues.map(
              (issue) =>
                `fermStationData.fermConversion[${index}].${issue.path.join(".")}: ${issue.message}`,
            ),
          }
        }

        processingConversions.push(conversion.data)
      }
    }
  }
  const smelterData = source.data.smelterData
  if (smelterData !== undefined && smelterData !== null) {
    if (typeof smelterData !== "object" || Array.isArray(smelterData)) {
      return failure("smelterData: expected an object")
    }

    const smelterRecord = smelterData as Record<string, unknown>
    const rawConversions = smelterRecord.smelterConversion
    if (rawConversions !== undefined && rawConversions !== null) {
      if (!Array.isArray(rawConversions)) {
        return failure("smelterData.smelterConversion: expected a YAML list")
      }

      const fuelItem = smelterRecord.fuelItem
      const fuelPrefab =
        typeof fuelItem === "object" &&
        fuelItem !== null &&
        !Array.isArray(fuelItem)
          ? (fuelItem as Record<string, unknown>).name
          : undefined
      const fuelPerProduct = optionalSourceValue(smelterRecord.fuelPerProduct)
      processingConversions ??= []

      for (const [index, rawConversion] of rawConversions.entries()) {
        if (
          typeof rawConversion !== "object" ||
          rawConversion === null ||
          Array.isArray(rawConversion)
        ) {
          return failure(
            `smelterData.smelterConversion[${index}]: expected an object`,
          )
        }

        const sourceConversion = rawConversion as Record<string, unknown>
        const conversion = gameProcessingConversionSchema.safeParse({
          inputPrefab: sourceConversion.FromName,
          resultPrefab: sourceConversion.ToName,
          outputAmount: 1,
          removeInput: sourceConversion.Remove,
          fuelPrefab,
          fuelPerProduct,
        })
        if (!conversion.success) {
          return {
            success: false,
            errors: conversion.error.issues.map(
              (issue) =>
                `smelterData.smelterConversion[${index}].${issue.path.join(".")}: ${issue.message}`,
            ),
          }
        }

        processingConversions.push(conversion.data)
      }
    }
  }
  const prefab = source.data.name
  const isUpgrade = source.data.isUpgrade === true
  const verifiedUpgradeLevel =
    typeof prefab === "string" ? getStationUpgradeLevel(prefab) : undefined

  const piece = gamePieceSchema.safeParse({
    prefab,
    nameToken: source.data.m_name,
    craftingStation: optionalSourceValue(source.data.craftingStation),
    minStationLevel: optionalSourceValue(source.data.minStationLevel),
    disabled: optionalSourceValue(source.data.disabled),
    isUpgrade,
    upgradeStationPrefab: isUpgrade
      ? optionalSourceValue(upgradeStation)
      : undefined,
    upgradeLevel: isUpgrade ? verifiedUpgradeLevel : undefined,
    buildRequirements: requirements.data,
    processingConversions,
  })

  if (!piece.success) {
    return { success: false, errors: formatIssues(piece.error) }
  }

  return { success: true, data: piece.data }
}

export function linkRecipeResult(
  candidate: RecipeCandidate,
  itemsByPrefab: ReadonlyMap<string, GameItem>,
): ImportResult<GameRecipe> {
  const directMatch = itemsByPrefab.get(candidate.sourceName)
  const aliasedPrefab = verifiedRecipeResultAliases.get(candidate.sourceName)
  const aliasedMatch = aliasedPrefab
    ? itemsByPrefab.get(aliasedPrefab)
    : undefined
  const item = directMatch ?? aliasedMatch
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