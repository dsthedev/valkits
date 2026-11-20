import { z } from "zod"

export const biomes = [
  "Meadows",
  "Black Forest",
  "Swamp",
  "Mountain",
  "Plains",
  "Ocean",
  "Mistlands",
  "Ashlands",
  "Deep North",
] as const

const identifierSchema = z.string().trim().min(1)
const positiveIntegerSchema = z.number().int().positive()
const nonNegativeIntegerSchema = z.number().int().nonnegative()
const statValueSchema = z.number().finite().nonnegative()

export const biomeSchema = z.enum(biomes)

export const gameItemSchema = z.object({
  prefab: identifierSchema,
  nameToken: identifierSchema,
  descriptionToken: identifierSchema.optional(),
  itemType: identifierSchema.optional(),
  maxStackSize: positiveIntegerSchema.optional(),
  maxQuality: positiveIntegerSchema.optional(),
  foodStats: z
    .object({
      health: statValueSchema.optional(),
      stamina: statValueSchema.optional(),
      eitr: statValueSchema.optional(),
      durationSeconds: statValueSchema.optional(),
    })
    .optional(),
  armorStats: z
    .object({
      armor: statValueSchema.optional(),
      armorPerLevel: statValueSchema.optional(),
    })
    .optional(),
  shieldStats: z
    .object({
      blockPower: statValueSchema.optional(),
      blockPowerPerLevel: statValueSchema.optional(),
      deflectionForce: statValueSchema.optional(),
      deflectionForcePerLevel: statValueSchema.optional(),
      timedBlockBonus: statValueSchema.optional(),
    })
    .optional(),
})

export const recipeRequirementSchema = z.object({
  prefab: identifierSchema,
  amount: nonNegativeIntegerSchema,
  amountPerLevel: nonNegativeIntegerSchema,
  recover: z.boolean(),
})

export const gameProcessingConversionSchema = z.object({
  inputPrefab: identifierSchema,
  resultPrefab: identifierSchema,
  outputAmount: positiveIntegerSchema,
  removeInput: z.boolean(),
  fuelPrefab: identifierSchema.optional(),
  fuelPerProduct: positiveIntegerSchema.optional(),
})

export const gameRecipeSchema = z.object({
  resultPrefab: identifierSchema,
  outputAmount: positiveIntegerSchema,
  craftingStation: identifierSchema.optional(),
  minStationLevel: positiveIntegerSchema.optional(),
  disabled: z.boolean().optional(),
  disabledUpgrade: z.boolean().optional(),
  noCraftOnlyUpgrade: z.boolean().optional(),
  requireOnlyOneIngredient: z.boolean().optional(),
  requirements: z.array(recipeRequirementSchema),
  upgradeRequirements: z.array(recipeRequirementSchema).optional(),
})

export const gamePieceSchema = z.object({
  prefab: identifierSchema,
  nameToken: identifierSchema,
  craftingStation: identifierSchema.optional(),
  minStationLevel: positiveIntegerSchema.optional(),
  disabled: z.boolean().optional(),
  isUpgrade: z.boolean(),
  upgradeStationPrefab: identifierSchema.optional(),
  upgradeLevel: positiveIntegerSchema.optional(),
  buildRequirements: z.array(recipeRequirementSchema),
  processingConversions: z.array(gameProcessingConversionSchema).optional(),
})

export const kitItemGoalSchema = z.object({
  prefab: identifierSchema,
  quantity: positiveIntegerSchema.optional(),
  targetQuality: positiveIntegerSchema.optional(),
})

export const kitSchema = z
  .object({
    id: identifierSchema,
    name: z.string().trim().min(1),
    biome: biomeSchema,
    description: z.string().optional(),
    itemGoals: z.array(kitItemGoalSchema),
  })
  .superRefine((kit, context) => {
    const seenPrefabs = new Set<string>()

    kit.itemGoals.forEach((goal, index) => {
      if (seenPrefabs.has(goal.prefab)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate item goal for ${goal.prefab}`,
          path: ["itemGoals", index, "prefab"],
        })
      }

      seenPrefabs.add(goal.prefab)
    })
  })

export type Biome = z.infer<typeof biomeSchema>
export type GameItem = z.infer<typeof gameItemSchema>
export type RecipeRequirement = z.infer<typeof recipeRequirementSchema>
export type GameProcessingConversion = z.infer<
  typeof gameProcessingConversionSchema
>
export type GameRecipe = z.infer<typeof gameRecipeSchema>
export type GamePiece = z.infer<typeof gamePieceSchema>
export type KitItemGoal = z.infer<typeof kitItemGoalSchema>
export type Kit = z.infer<typeof kitSchema>