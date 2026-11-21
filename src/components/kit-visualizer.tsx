import { ImmediateRecipeCosts } from "@/components/immediate-recipe-costs"
import { ItemIcon } from "@/components/item-icon"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { getFoodCategory, selectVisualizerFoods } from "@/domain/food-category"
import { calculateImmediateItemRequirements } from "@/domain/immediate-calculation"
import type { Kit } from "@/domain/schema"
import {
  calculateKitStationRequirements,
  groupStationRequirements,
  type StationRequirementDataAccess,
} from "@/domain/station-requirements"

function humanizePrefab(prefab: string): string {
  return prefab.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")
}

export function KitVisualizer({
  kit,
  data,
}: {
  kit: Kit | undefined
  data: StationRequirementDataAccess
}) {
  const { foods, extraFoodCount } = selectVisualizerFoods(kit, data.getItem)
  const stationRequirements = kit
    ? calculateKitStationRequirements(
        { ...kit, itemGoals: foods.map(({ goal }) => goal) },
        data
      ).itemRequirements
    : []
  const stations = groupStationRequirements(stationRequirements)
  const hasUnresolvedStations = stationRequirements.some(
    (requirement) => requirement.status === "unresolved"
  )

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            className="px-0 text-white/85 hover:text-white"
            variant="link"
          />
        }
      >
        Kit Visualizer
      </SheetTrigger>
      <SheetContent
        className="overflow-y-auto border data-[side=right]:inset-2 data-[side=right]:h-auto data-[side=right]:w-auto data-[side=right]:sm:max-w-none"
        side="right"
      >
        <SheetHeader className="border-b border-border pr-16">
          <SheetTitle>Kit Visualizer</SheetTitle>
          <SheetDescription>
            {kit ? `${kit.name} · ${kit.biome}` : "No kit selected"}
          </SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 content-start gap-8 p-4 sm:p-6 lg:grid-cols-[minmax(18rem,1fr)_minmax(0,2fr)]">
          <section
            aria-labelledby="visualizer-food-heading"
            className="min-w-0"
          >
            <section aria-labelledby="visualizer-food-stations-heading" className="mb-6">
              <h2 className="border-b border-border pb-2 font-medium" id="visualizer-food-stations-heading">
                Food stations
              </h2>
              {stations.length > 0 ? (
                <div className="mt-3 grid gap-2">
                  {stations.map((station) => {
                    const piece = data.getStationPiece(station.stationPrefab)
                    const costs = (piece?.buildRequirements ?? [])
                      .filter((requirement) => requirement.amount > 0)
                      .map((requirement) => ({
                        prefab: requirement.prefab,
                        craftAmount: requirement.amount,
                        qualityAmount: 0,
                        totalAmount: requirement.amount,
                      }))
                    return (
                      <div className="flex items-start gap-3 border border-border bg-card p-3" key={station.stationPrefab}>
                        <div aria-hidden="true" className="size-12 shrink-0 rounded-sm bg-gray-200" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <h3 className="font-medium break-words">{humanizePrefab(station.stationPrefab.replace(/^piece_/i, ""))}</h3>
                            {station.stationLevel !== undefined && (
                              <span className="text-xs text-muted-foreground">Level {station.stationLevel}</span>
                            )}
                          </div>
                          {costs.length > 0 ? (
                            <div className="mt-2">
                              <span className="text-xs text-muted-foreground">Base build</span>
                              <ImmediateRecipeCosts className="mt-1" requirements={costs} />
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-muted-foreground">Base build ingredients unavailable.</p>
                          )}
                          {piece?.buildRequirements.some((requirement) => requirement.amountPerLevel > 0 || requirement.recover) && (
                            <p className="mt-2 text-xs text-muted-foreground">Build increments and recovery are not applied.</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  {foods.length === 0 ? "No food stations to show." : "No food stations identified."}
                </p>
              )}
              {hasUnresolvedStations && (
                <p className="mt-2 text-xs text-muted-foreground">Some food station requirements are unresolved.</p>
              )}
            </section>
            <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-border pb-2">
              <h2 className="font-medium" id="visualizer-food-heading">
                Food
              </h2>
              <span className="text-xs text-muted-foreground">
                {Math.min(foods.length, 3)} / 3
              </span>
            </div>
            <div className="grid gap-2">
              {Array.from({ length: 3 }, (_, index) => {
                const food = foods[index]
                if (!food) {
                  return (
                    <div
                      className="flex min-h-24 items-center border border-dashed border-border px-3 text-xs text-muted-foreground"
                      key={`empty-${index}`}
                    >
                      Empty food slot
                    </div>
                  )
                }
                const category = getFoodCategory(food.item)
                const costs = calculateImmediateItemRequirements(
                  food.goal,
                  data
                )
                const accent =
                  category === "health"
                    ? "border-l-red-400"
                    : category === "stamina"
                      ? "border-l-yellow-400"
                      : category === "eitr"
                        ? "border-l-purple-400"
                        : "border-l-muted-foreground"
                return (
                  <div
                    className={`min-h-24 border border-l-4 border-border ${accent} bg-card p-3`}
                    key={food.goal.prefab}
                  >
                    <div className="flex items-center gap-3">
                      <ItemIcon prefab={food.goal.prefab} size="lg" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <h3 className="font-medium break-words">
                            {humanizePrefab(food.goal.prefab)}
                          </h3>
                          <span className="text-xs text-muted-foreground">
                            Qty {food.goal.quantity ?? 1}
                          </span>
                        </div>
                        {costs.requirements.length > 0 && (
                          <ImmediateRecipeCosts
                            className="mt-2"
                            requirements={costs.requirements}
                          />
                        )}
                        {costs.unresolved.length > 0 && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Direct ingredients unavailable or incomplete.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {extraFoodCount > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {extraFoodCount} additional food goal
                {extraFoodCount === 1 ? "" : "s"} not shown.
              </p>
            )}
          </section>
          <div className="grid min-w-0 content-start gap-6 sm:grid-cols-2">
            {[
              "Station upgrades",
              "Stations",
              "Armor & utility",
              "Weapons",
              "Other items",
            ].map((label) => (
              <section
                className="min-h-24 border-t border-border pt-2"
                key={label}
              >
                <h2 className="font-medium">{label}</h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  {label} coming soon.
                </p>
              </section>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
