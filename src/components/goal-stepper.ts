export function getGoalStepperValue(
  value: number,
  direction: -1 | 1,
  shiftKey: boolean,
  tone: "quantity" | "quality",
  maximum?: number,
): number {
  const step = tone === "quantity" && shiftKey ? 5 : 1
  return Math.max(
    1,
    Math.min(maximum ?? Number.POSITIVE_INFINITY, value + direction * step),
  )
}
