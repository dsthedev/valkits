import { describe, expect, it } from "vitest"
import { selectProcessingConversion } from "./processing-source"

describe("processing source selection", () => {
  it("prefers Copper Ore over Copper Scrap", () => {
    const conversions = [
      { inputPrefab: "CopperScrap" },
      { inputPrefab: "CopperOre" },
    ]

    expect(selectProcessingConversion("Copper", conversions)).toEqual({
      inputPrefab: "CopperOre",
    })
  })

  it("selects a sole conversion and leaves other alternatives unresolved", () => {
    expect(
      selectProcessingConversion("Tin", [{ inputPrefab: "TinOre" }]),
    ).toEqual({ inputPrefab: "TinOre" })
    expect(
      selectProcessingConversion("Coal", [
        { inputPrefab: "Wood" },
        { inputPrefab: "FineWood" },
      ]),
    ).toBeUndefined()
  })

  it("prefers the regular cooking station for conversions shared with the iron station", () => {
    const regularConversion = {
      inputPrefab: "RawMeat",
      resultPrefab: "CookedMeat",
      outputAmount: 1,
      removeInput: false,
      stationPrefab: "piece_cookingstation",
    }
    const ironConversion = {
      ...regularConversion,
      stationPrefab: "piece_cookingstation_iron",
    }

    expect(
      selectProcessingConversion("CookedMeat", [
        ironConversion,
        regularConversion,
      ]),
    ).toEqual(regularConversion)
  })

  it("resolves identical conversion records for resource-only calculations", () => {
    const conversion = {
      inputPrefab: "RawMeat",
      resultPrefab: "CookedMeat",
      outputAmount: 1,
      removeInput: false,
    }

    expect(
      selectProcessingConversion("CookedMeat", [conversion, conversion]),
    ).toEqual(conversion)
  })
})