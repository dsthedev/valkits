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
})