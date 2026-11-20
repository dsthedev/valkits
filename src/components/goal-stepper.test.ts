import { describe, expect, it } from "vitest"
import { getGoalStepperValue } from "./goal-stepper"

describe("goal stepper values", () => {
  it("steps quantity by five with Shift and clamps to the supported range", () => {
    expect(getGoalStepperValue(2, 1, true, "quantity", 10)).toBe(7)
    expect(getGoalStepperValue(8, 1, true, "quantity", 10)).toBe(10)
    expect(getGoalStepperValue(4, -1, true, "quantity", 10)).toBe(1)
  })

  it("keeps ordinary clicks and quality steps at one", () => {
    expect(getGoalStepperValue(2, 1, false, "quantity", 10)).toBe(3)
    expect(getGoalStepperValue(2, 1, true, "quality", 4)).toBe(3)
  })
})
