import type { GameProcessingConversion } from "./schema"

const preferredInputByResult: Readonly<Record<string, string>> = {
  Copper: "CopperOre",
}

export function selectProcessingConversion<
  T extends Pick<GameProcessingConversion, "inputPrefab">,
>(
  resultPrefab: string,
  conversions: readonly T[],
): T | undefined {
  if (conversions.length === 1) return conversions[0]

  const preferredInput = preferredInputByResult[resultPrefab]
  return preferredInput
    ? conversions.find((conversion) => conversion.inputPrefab === preferredInput)
    : undefined
}