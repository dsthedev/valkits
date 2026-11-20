import { describe, expect, it } from "vitest"
import { getResourceCategory } from "./resource-category"

describe("resource categories", () => {
  it("groups food and consumable item types together", () => {
    expect(getResourceCategory("Consumable")).toBe("Food & consumables")
    expect(getResourceCategory("Fish")).toBe("Food & consumables")
  })

  it("groups materials and equipment item types", () => {
    expect(getResourceCategory("Material")).toBe("Materials")
    expect(getResourceCategory("OneHandedWeapon")).toBe("Gear & ammo")
    expect(getResourceCategory("Ammo")).toBe("Gear & ammo")
  })

  it("keeps missing and unclassified item types in Other", () => {
    expect(getResourceCategory("Misc")).toBe("Other")
    expect(getResourceCategory(undefined)).toBe("Other")
  })
})