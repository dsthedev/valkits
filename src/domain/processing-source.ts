import type { GameProcessingConversion } from "./schema"

const preferredInputByResult: Readonly<Record<string, string>> = {
  Copper: "CopperOre",
}

export function selectProcessingConversion<
  T extends Pick<GameProcessingConversion, "inputPrefab"> &
    Partial<
      Pick<
        GameProcessingConversion,
        | "resultPrefab"
        | "outputAmount"
        | "removeInput"
        | "fuelPrefab"
        | "fuelPerProduct"
      >
    > & { stationPrefab?: string },
>(
  resultPrefab: string,
  conversions: readonly T[],
): T | undefined {
  if (conversions.length === 1) return conversions[0]

  const firstConversion = conversions[0]
  const equivalentConversions =
    firstConversion?.resultPrefab !== undefined &&
    firstConversion.outputAmount !== undefined &&
    conversions.every(
      (conversion) =>
        conversion.inputPrefab === firstConversion.inputPrefab &&
        conversion.resultPrefab === firstConversion.resultPrefab &&
        conversion.outputAmount === firstConversion.outputAmount &&
        conversion.removeInput === firstConversion.removeInput &&
        conversion.fuelPrefab === firstConversion.fuelPrefab &&
        conversion.fuelPerProduct === firstConversion.fuelPerProduct,
    )
  if (equivalentConversions) {
    const regularCookingStation = conversions.find(
      (conversion) => conversion.stationPrefab === "piece_cookingstation",
    )
    if (
      regularCookingStation &&
      conversions.every(
        (conversion) =>
          conversion.stationPrefab === "piece_cookingstation" ||
          conversion.stationPrefab === "piece_cookingstation_iron",
      )
    ) {
      return regularCookingStation
    }
    if (conversions.every((conversion) => conversion.stationPrefab === undefined)) {
      return firstConversion
    }
  }

  const preferredInput = preferredInputByResult[resultPrefab]
  return preferredInput
    ? conversions.find((conversion) => conversion.inputPrefab === preferredInput)
    : undefined
}