import { useState } from "react"
import { ItemIcon } from "@/components/item-icon"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Kit } from "@/domain/schema"
import type { UnresolvedReason } from "@/domain/resource-calculation"
import {
  groupStationRequirements,
  type StationRequirementReason,
} from "@/domain/station-requirements"
import type { KitCalculationSnapshot } from "@/data/calculation-snapshots"
import { isUpgraderItemPrefab } from "@/domain/upgrader-items"

interface CalculationResultsProps {
  kit: Kit
  snapshot: KitCalculationSnapshot
  stale: boolean
  hideUpgraderItems: boolean
  costsSheetOpen: boolean
  onCostsSheetOpenChange(open: boolean): void
}

interface CostRow {
  prefab: string
  amount: number
}

const resourceReasonLabels: Record<UnresolvedReason, string> = {
  "unknown-prefab": "Item not found in game data",
  "known-item-no-recipe": "No recipe or acquisition source is known",
  "disabled-recipe": "Recipe is disabled",
  "upgrade-only-recipe": "Only upgrade recipes are available",
  "ambiguous-recipe": "Multiple enabled recipes; cost is ambiguous",
  "alternative-requirements": "Alternative ingredients are not selected",
  "ambiguous-processing-conversion": "Multiple processing conversions",
  "ambiguous-acquisition-source": "Multiple acquisition sources",
  "circular-recipe": "Recipe chain loops",
  "invalid-quantity": "Quantity is not supported for this item",
  "invalid-target-quality":
    "Target quality is outside the item's supported range",
  "unsupported-quality": "Quality upgrade costs are not yet supported",
  "quality-upgrades-disabled": "Recipe does not allow quality upgrades",
  "unsupported-upgrade-requirements":
    "Separate quality requirements are not supported yet",
  "unsupported-quality-batch":
    "Quality upgrades for batch outputs are not supported yet",
}

const stationRequirementReasonLabels: Record<StationRequirementReason, string> =
  {
    "unknown-item": "Item not found in game data",
    "no-recipe": "No recipe available in the imported data",
    "disabled-recipe": "Recipe is disabled",
    "upgrade-only-recipe": "Only upgrade recipes are available",
    "ambiguous-recipe": "Multiple enabled craft recipes",
    "ambiguous-processing-conversion": "Multiple processing conversions",
    "ambiguous-acquisition-source":
      "Both craft and processing sources are available",
    "processing-cycle": "Processing conversion chain loops",
    "unresolved-station": "Station reference could not be matched",
    "missing-station-level": "Recipe does not specify a minimum level",
    "invalid-target-quality":
      "Target quality is outside the item's supported range",
    "quality-upgrades-disabled": "Recipe does not allow quality upgrades",
  }

const stationResourceIssueLabels = {
  "missing-station-piece": "Station piece data is missing",
  "disabled-station-piece": "Station piece is disabled",
  "missing-station-upgrade": "Required station upgrade data is missing",
  "unmapped-station-upgrade":
    "Station upgrade level is not verified in the source data",
  "ambiguous-station-upgrade": "Multiple upgrades match this station level",
  "disabled-station-upgrade": "Required station upgrade is disabled",
} as const

function humanizePrefab(prefab: string): string {
  return prefab.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")
}

function combineCosts(
  kitResourceCosts: readonly CostRow[],
  stationCosts: readonly CostRow[]
): CostRow[] {
  const amountsByPrefab = new Map<string, number>()
  for (const cost of [...kitResourceCosts, ...stationCosts]) {
    amountsByPrefab.set(
      cost.prefab,
      (amountsByPrefab.get(cost.prefab) ?? 0) + cost.amount
    )
  }

  return [...amountsByPrefab]
    .map(([prefab, amount]) => ({ prefab, amount }))
    .sort((left, right) => left.prefab.localeCompare(right.prefab))
}

function CostTable({
  title,
  costs,
}: {
  title: string
  costs: readonly CostRow[]
}) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="font-medium">{title}</h3>
      {costs.length > 0 ? (
        <Table className="mt-2">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-0">Resource</TableHead>
              <TableHead className="pr-0 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {costs.map((cost) => (
              <TableRow key={cost.prefab}>
                <TableCell className="min-w-0 pl-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <ItemIcon prefab={cost.prefab} size="sm" />
                    <span className="break-words">
                      {humanizePrefab(cost.prefab)}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="pr-0 text-right font-medium tabular-nums">
                  {cost.amount.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          No cost totals are available.
        </p>
      )}
    </section>
  )
}

export function CalculationResults({
  kit,
  snapshot,
  stale,
  hideUpgraderItems,
  costsSheetOpen,
  onCostsSheetOpenChange,
}: CalculationResultsProps) {
  const [advancedSheetOpen, setAdvancedSheetOpen] = useState(false)
  const [showCombinedCosts, setShowCombinedCosts] = useState(true)
  const [costView, setCostView] = useState<"total" | "craft" | "quality">(
    "total"
  )
  const calculation = snapshot.calculation
  const kitResourceCosts = calculation.leafRequirements
    .filter(
      (requirement) =>
        !hideUpgraderItems || !isUpgraderItemPrefab(requirement.prefab)
    )
    .map(({ prefab, amount }) => ({ prefab, amount }))
  const stationResources = snapshot.stationResources.stationResources
    .filter(
      (resource) => !hideUpgraderItems || !isUpgraderItemPrefab(resource.prefab)
    )
    .map(({ prefab, amount }) => ({ prefab, amount }))
  const combinedCosts = combineCosts(kitResourceCosts, stationResources)
  const unresolvedResources = calculation.unresolved.filter(
    (issue) => !hideUpgraderItems || !isUpgraderItemPrefab(issue.prefab)
  )
  const isComplete =
    calculation.isComplete && snapshot.stationResources.isComplete
  const stationItemRequirements =
    snapshot.stationRequirements.itemRequirements.filter(
      (requirement) =>
        !hideUpgraderItems || !isUpgraderItemPrefab(requirement.itemPrefab)
    )
  const groupedStationRequirements = groupStationRequirements(
    stationItemRequirements
  )
  const ungroupedStationRequirements = stationItemRequirements.filter(
    (requirement) => requirement.status !== "required"
  )
  const directRequirements = calculation.directRequirements.filter(
    (requirement) =>
      !hideUpgraderItems || !isUpgraderItemPrefab(requirement.prefab)
  )
  const unresolvedStationMaterials =
    snapshot.stationResources.unresolvedResources.filter(
      (issue) => !hideUpgraderItems || !isUpgraderItemPrefab(issue.prefab)
    )
  const unresolvedStationRequirements =
    snapshot.stationResources.unresolvedStationRequirements.filter(
      (requirement) =>
        !hideUpgraderItems || !isUpgraderItemPrefab(requirement.itemPrefab)
    )

  return (
    <>
      <Button onClick={() => onCostsSheetOpenChange(true)} variant="outline">
        View costs
      </Button>
      <Button onClick={() => setAdvancedSheetOpen(true)} variant="outline">
        Advanced breakdown
      </Button>

      <Sheet open={costsSheetOpen} onOpenChange={onCostsSheetOpenChange}>
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-xl"
          side="right"
        >
          <SheetHeader className="border-b border-border">
            <SheetTitle>Resource plan</SheetTitle>
            <SheetDescription>
              {kit.name} · Recursive kit resources and required station
              resources.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 sm:p-6">
            <Button
              aria-pressed={showCombinedCosts}
              className="mb-4"
              onClick={() =>
                setShowCombinedCosts((showCombined) => !showCombined)
              }
              variant={showCombinedCosts ? "secondary" : "outline"}
            >
              {showCombinedCosts
                ? "Show separate costs"
                : "Show combined costs"}
            </Button>
            {stale && (
              <p
                className="mb-4 text-sm text-amber-800 dark:text-amber-200"
                role="status"
              >
                Kit contents or game data changed. Recalculate to refresh these
                costs.
              </p>
            )}
            <p className="mb-4 text-sm text-muted-foreground" role="status">
              {isComplete
                ? "All known recipe and station requirements are resolved."
                : "Partial plan: some item sources or station costs are unresolved."}
            </p>
            {showCombinedCosts ? (
              <CostTable title="Combined costs" costs={combinedCosts} />
            ) : (
              <>
                <CostTable title="Kit resources" costs={kitResourceCosts} />
                <CostTable
                  title="Required station costs"
                  costs={stationResources}
                />
              </>
            )}
            {unresolvedResources.length > 0 ||
            !snapshot.stationResources.isComplete ? (
              <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">
                Some costs could not be resolved. See the advanced breakdown for
                details.
              </p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={advancedSheetOpen} onOpenChange={setAdvancedSheetOpen}>
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-xl"
          side="right"
        >
          <SheetHeader className="border-b border-border">
            <SheetTitle>Advanced breakdown</SheetTitle>
            <SheetDescription>
              {kit.name} · Detailed recipe, station requirement, and unresolved
              cost information.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 sm:p-6">
            {stale && (
              <p
                className="mb-3 text-sm text-amber-800 dark:text-amber-200"
                role="status"
              >
                Kit contents or game data changed. Recalculate to refresh these
                costs.
              </p>
            )}

            <div
              className="mb-3 inline-flex rounded-lg bg-muted p-1"
              role="group"
              aria-label="Cost view"
            >
              {(["total", "craft", "quality"] as const).map((view) => (
                <Button
                  aria-pressed={costView === view}
                  key={view}
                  onClick={() => setCostView(view)}
                  size="sm"
                  variant={costView === view ? "secondary" : "ghost"}
                >
                  {view === "total"
                    ? "Total"
                    : view === "craft"
                      ? "Craft"
                      : "Quality"}
                </Button>
              ))}
            </div>

            {directRequirements.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-0">Resource</TableHead>
                    <TableHead className="w-20 pr-0 text-right">
                      {costView === "total"
                        ? "Total"
                        : costView === "craft"
                          ? "Craft"
                          : "Quality"}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {directRequirements.map((requirement) => (
                    <TableRow key={requirement.prefab}>
                      <TableCell className="min-w-0 pl-0">
                        <span className="flex min-w-0 items-center gap-2">
                          <ItemIcon prefab={requirement.prefab} size="sm" />
                          <span className="break-words">
                            {humanizePrefab(requirement.prefab)}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="pr-0 text-right font-medium tabular-nums">
                        {(costView === "total"
                          ? requirement.totalAmount
                          : costView === "craft"
                            ? requirement.craftAmount
                            : requirement.qualityAmount
                        ).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="border-t border-border/60 py-4 text-sm text-muted-foreground">
                No direct ingredient totals are available.
              </p>
            )}

            <section className="mt-6 border-t border-border/70 pt-4">
              <h3 className="text-sm font-medium">
                Crafting station requirements
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Highest level needed for the base recipe and requested quality.
                Station construction and upgrade materials are shown separately.
              </p>
              {groupedStationRequirements.length > 0 ? (
                <ul className="mt-3 divide-y divide-border/70 border-y border-border/70">
                  {groupedStationRequirements.map((group) => (
                    <li className="py-2.5" key={group.stationPrefab}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">
                          {humanizePrefab(
                            group.stationPrefab.replace(/^piece_/i, "")
                          )}
                        </span>
                        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                          {group.stationLevel !== undefined
                            ? `Level ${group.stationLevel}`
                            : null}
                        </span>
                      </div>
                      <details className="mt-1 text-xs text-muted-foreground">
                        <summary className="w-fit cursor-pointer rounded-sm underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">
                          {group.itemRequirements.length}{" "}
                          {group.itemRequirements.length === 1
                            ? "item"
                            : "items"}
                        </summary>
                        <ul className="mt-2 ml-4 list-disc space-y-1">
                          {group.itemRequirements.map((requirement) => (
                            <li key={requirement.itemPrefab}>
                              {humanizePrefab(requirement.itemPrefab)}
                              {requirement.stationLevel !== undefined &&
                                group.stationLevel !== undefined &&
                                requirement.stationLevel < group.stationLevel &&
                                ` (level ${requirement.stationLevel})`}
                              {requirement.targetQuality > 1 &&
                                ` · Quality ${requirement.targetQuality}`}
                              {requirement.status === "required" &&
                                requirement.outputAmountPerInput !==
                                  undefined &&
                                ` · ${requirement.outputAmountPerInput} per base`}
                              {requirement.status === "unresolved" &&
                                ` · ${stationRequirementReasonLabels[requirement.reason]}`}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No station requirements were resolved.
                </p>
              )}
              {ungroupedStationRequirements.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="w-fit cursor-pointer text-muted-foreground underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">
                    Items without a resolved station (
                    {ungroupedStationRequirements.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {ungroupedStationRequirements.map((requirement) => (
                      <li key={requirement.itemPrefab}>
                        {humanizePrefab(requirement.itemPrefab)}:{" "}
                        {requirement.status === "unresolved"
                          ? stationRequirementReasonLabels[requirement.reason]
                          : "No station listed in recipe"}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>

            <section className="mt-6 border-t border-border/70 pt-4">
              <h3 className="text-sm font-medium">Station resources</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Separate from kit resources. Includes station construction,
                required upgrade pieces, and their item recipe chains.
              </p>
              {stationResources.length > 0 ? (
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-0">Resource</TableHead>
                      <TableHead className="pr-0 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stationResources.map((resource) => (
                      <TableRow key={resource.prefab}>
                        <TableCell className="min-w-0 pl-0">
                          <span className="flex min-w-0 items-center gap-2">
                            <ItemIcon prefab={resource.prefab} size="sm" />
                            <span className="break-words">
                              {humanizePrefab(resource.prefab)}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="pr-0 text-right font-medium tabular-nums">
                          {resource.amount.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No station resource totals are available.
                </p>
              )}
              {snapshot.stationResources.unresolvedStations.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-amber-800 dark:text-amber-200">
                  {snapshot.stationResources.unresolvedStations.map(
                    (issue, index) => (
                      <li
                        key={`${issue.stationPrefab}:${issue.level}:${index}`}
                      >
                        {humanizePrefab(issue.stationPrefab)}
                        {issue.level !== undefined &&
                          ` level ${issue.level}`}:{" "}
                        {stationResourceIssueLabels[issue.reason]}
                      </li>
                    )
                  )}
                </ul>
              )}
              {unresolvedStationMaterials.length > 0 && (
                <details className="mt-3 text-xs">
                  <summary className="w-fit cursor-pointer text-muted-foreground underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">
                    Unresolved station materials (
                    {unresolvedStationMaterials.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {unresolvedStationMaterials.map((issue) => (
                      <li key={`${issue.prefab}:${issue.reason}`}>
                        {humanizePrefab(issue.prefab)} × {issue.amount}:{" "}
                        {issue.reason.replaceAll("-", " ")}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {unresolvedStationRequirements.length > 0 && (
                <p className="mt-3 text-xs text-amber-800 dark:text-amber-200">
                  Some kit items have unresolved station requirements; this
                  station resource list is incomplete.
                </p>
              )}
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {snapshot.stationResources.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </section>

            {unresolvedResources.length > 0 && (
              <section className="mt-5">
                <h3 className="text-sm font-medium">Unresolved items</h3>
                <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                  {unresolvedResources.map((issue) => (
                    <li key={`${issue.prefab}:${issue.reason}`}>
                      {humanizePrefab(issue.prefab)}:{" "}
                      {resourceReasonLabels[issue.reason]}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-5 border-t border-border/70 pt-4">
              <h3 className="text-sm font-medium">Calculation limitations</h3>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                {[
                  ...calculation.limitations,
                  ...snapshot.stationResources.limitations,
                ].map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
