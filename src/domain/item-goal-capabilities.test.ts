import { describe, expect, it } from "vitest"
import { gameItemSchema } from "./schema"
import { getItemGoalCapabilities } from "./item-goal-capabilities"

function item(
  prefab: string,
  itemType: string,
  maxStackSize: number,
  maxQuality: number,
) {
  return gameItemSchema.parse({
    prefab,
    nameToken: `$item_${prefab.toLowerCase()}`,
    itemType,
    maxStackSize,
    maxQuality,
  })
}

describe("item goal capabilities", () => {
  it("offers quantity goals for supported stackable item types", () => {
    for (const itemType of ["Ammo", "Consumable", "Material", "Misc"]) {
      expect(
        getItemGoalCapabilities(item(`${itemType}Item`, itemType, 50, 1))
          .quantity,
      ).toBe(true)
    }
  })

  it("offers quality goals for equipment with multiple qualities", () => {
    for (const itemType of [
      "Bow",
      "Chest",
      "Helmet",
      "Legs",
      "OneHandedWeapon",
      "Shield",
      "Shoulder",
      "TwoHandedWeapon",
    ]) {
      expect(
        getItemGoalCapabilities(item(`${itemType}Item`, itemType, 1, 4))
          .maxQuality,
      ).toBe(4)
    }
  })

  it("requires both a supported type and relevant item metadata", () => {
    expect(getItemGoalCapabilities(item("SingleMisc", "Misc", 1, 1))).toEqual({
      quantity: false,
      maxQuality: null,
    })
    expect(
      getItemGoalCapabilities(item("StackableWeapon", "OneHandedWeapon", 50, 1)),
    ).toEqual({ quantity: false, maxQuality: null })
    expect(
      getItemGoalCapabilities(item("Unclassified", "UnknownType", 50, 4)),
    ).toEqual({ quantity: false, maxQuality: null })
  })
})