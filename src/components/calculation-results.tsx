import { useState, type ReactNode } from "react"
import {
  RiArrowDownLine,
  RiArrowUpDownLine,
  RiArrowUpLine,
} from "@remixicon/react"
import { ItemIcon } from "@/components/item-icon"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { UnresolvedReason } from "@/domain/resource-calculation"
import type { KitResourceCalculation } from "@/domain/resource-calculation"
import {
  getResourceCategory,
  resourceCategories,
  type ResourceCategory,
} from "@/domain/resource-category"
import type { GameItem, GamePiece } from "@/domain/schema"
import { stationUpgradePaths } from "@/domain/station-upgrade-paths"
import {
  groupStationRequirements,
  type KitStationRequirementCalculation,
  type StationRequirementReason,
} from "@/domain/station-requirements"
import type { StationResourceCalculation } from "@/domain/station-resource-calculation"
import { isUpgraderItemPrefab } from "@/domain/upgrader-items"

interface CalculationResultsProps {
  calculation: KitResourceCalculation
  stationRequirements: KitStationRequirementCalculation
  stationResourceCalculation: StationResourceCalculation
  hideUpgraderItems: boolean
  getItem(prefab: string): GameItem | undefined
  getStationPiece(stationReference: string): GamePiece | undefined
  getStationUpgrades(stationPrefab: string): readonly GamePiece[]
}

interface CostRow {
  prefab: string
  amount: number
}

type SortColumn = "resource" | "amount"
type SortDirection = "ascending" | "descending"
interface CostSort {
  column: SortColumn
  direction: SortDirection
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

function groupCostsByCategory(
  costs: readonly CostRow[],
  getItem: (prefab: string) => GameItem | undefined
): Array<{ category: ResourceCategory; costs: CostRow[] }> {
  const grouped = new Map<ResourceCategory, CostRow[]>()
  for (const cost of costs) {
    const category = getResourceCategory(getItem(cost.prefab)?.itemType)
    const categoryCosts = grouped.get(category) ?? []
    categoryCosts.push(cost)
    grouped.set(category, categoryCosts)
  }

  return resourceCategories.flatMap((category) => {
    const categoryCosts = grouped.get(category)
    return categoryCosts ? [{ category, costs: categoryCosts }] : []
  })
}

function sortCosts(
  costs: readonly CostRow[],
  sort: CostSort | null
): CostRow[] {
  if (!sort) return [...costs]

  const direction = sort.direction === "ascending" ? 1 : -1
  return [...costs].sort((left, right) => {
    const comparison =
      sort.column === "resource"
        ? humanizePrefab(left.prefab).localeCompare(
            humanizePrefab(right.prefab)
          )
        : left.amount - right.amount
    return comparison * direction || left.prefab.localeCompare(right.prefab)
  })
}

function PieceRequirementsTooltip({
  pieces,
  children,
}: {
  pieces: readonly (GamePiece | undefined)[]
  children: ReactNode
}) {
  const availablePieces = pieces.filter(
    (piece): piece is GamePiece => piece !== undefined
  )
  if (availablePieces.length === 0) return <>{children}</>

  return (
    <Tooltip>
      <TooltipTrigger delay={350}>{children}</TooltipTrigger>
      <TooltipContent className="w-72 max-w-[calc(100vw-2rem)] text-xs">
        <div className="space-y-3">
          {availablePieces.map((piece) => (
            <section key={piece.prefab}>
              <h4 className="mb-1 font-semibold">
                {piece.isUpgrade
                  ? `Level ${piece.upgradeLevel ?? "?"} upgrade materials`
                  : "Station materials"}
              </h4>
              {piece.buildRequirements.length > 0 ? (
                <ul className="space-y-1">
                  {piece.buildRequirements.map((requirement) => (
                    <li
                      className="flex items-center justify-between gap-3"
                      key={requirement.prefab}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <ItemIcon prefab={requirement.prefab} size="xs" />
                        <span className="truncate">
                          {humanizePrefab(requirement.prefab)}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {requirement.amount.toLocaleString()}
                        {requirement.amountPerLevel > 0 &&
                          ` (+${requirement.amountPerLevel.toLocaleString()}/level)`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  No direct build materials are listed.
                </p>
              )}
            </section>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function CostTable({
  costs,
  groupByType,
  getItem,
}: {
  costs: readonly CostRow[]
  groupByType: boolean
  getItem(prefab: string): GameItem | undefined
}) {
  const [sort, setSort] = useState<CostSort | null>(null)
  const sortedCosts = sortCosts(costs, sort)
  const groupedCosts = groupByType
    ? groupCostsByCategory(sortedCosts, getItem)
    : null

  function cycleSort(column: SortColumn) {
    setSort((current) => {
      if (current?.column !== column) {
        return { column, direction: "ascending" }
      }
      if (current.direction === "ascending") {
        return { column, direction: "descending" }
      }
      return null
    })
  }

  function renderSortHeader(column: SortColumn, label: string) {
    const direction = sort?.column === column ? sort.direction : null
    const nextDirection =
      direction === "ascending"
        ? "descending"
        : direction === "descending"
          ? "unsorted"
          : "ascending"
    const Icon =
      direction === "ascending"
        ? RiArrowUpLine
        : direction === "descending"
          ? RiArrowDownLine
          : RiArrowUpDownLine

    return (
      <TableHead
        aria-sort={direction ?? "none"}
        className={column === "resource" ? "pl-0" : "pr-0 text-right"}
        key={column}
      >
        <Button
          aria-label={`Sort by ${label}; currently ${direction ?? "unsorted"}. Click to sort ${nextDirection}.`}
          className="h-8 px-2"
          onClick={() => cycleSort(column)}
          size="sm"
          variant="ghost"
        >
          {label}
          <Icon aria-hidden="true" className="size-4" />
        </Button>
      </TableHead>
    )
  }

  function renderCostRow(cost: CostRow) {
    return (
      <TableRow key={cost.prefab}>
        <TableCell className="min-w-0 pl-0">
          <span className="flex min-w-0 items-center gap-2">
            <ItemIcon prefab={cost.prefab} size="sm" />
            <span className="break-words">{humanizePrefab(cost.prefab)}</span>
          </span>
        </TableCell>
        <TableCell className="pr-0 text-right font-medium tabular-nums">
          {cost.amount.toLocaleString()}
        </TableCell>
      </TableRow>
    )
  }

  return (
    <section className="mt-5 first:mt-0">
      {/* <h3 className="font-medium">{title}</h3> */}
      {costs.length > 0 ? (
        <Table className="mt-2">
          <TableHeader>
            <TableRow>
              {renderSortHeader("resource", "Resource")}
              {renderSortHeader("amount", "Amount")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedCosts
              ? groupedCosts.flatMap(({ category, costs: categoryCosts }) => [
                  <TableRow key={`category:${category}`}>
                    <TableCell
                      className="bg-muted/40 py-2 text-xs font-semibold text-muted-foreground"
                      colSpan={2}
                    >
                      {category}
                    </TableCell>
                  </TableRow>,
                  ...categoryCosts.map(renderCostRow),
                ])
              : sortedCosts.map(renderCostRow)}
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
  calculation,
  stationRequirements,
  stationResourceCalculation,
  hideUpgraderItems,
  getItem,
  getStationPiece,
  getStationUpgrades,
}: CalculationResultsProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [activeSheet, setActiveSheet] = useState<"advanced" | "stations">(
    "advanced"
  )
  const [showCombinedCosts, setShowCombinedCosts] = useState(true)
  const [groupByType, setGroupByType] = useState(false)
  const [costView, setCostView] = useState<"total" | "craft" | "quality">(
    "total"
  )
  const kitResourceCosts = calculation.leafRequirements
    .filter(
      (requirement) =>
        !hideUpgraderItems || !isUpgraderItemPrefab(requirement.prefab)
    )
    .map(({ prefab, amount }) => ({ prefab, amount }))
  const stationResources = stationResourceCalculation.stationResources
    .filter(
      (resource) => !hideUpgraderItems || !isUpgraderItemPrefab(resource.prefab)
    )
    .map(({ prefab, amount }) => ({ prefab, amount }))
  const combinedCosts = combineCosts(kitResourceCosts, stationResources)
  const totalResourceAmount = combinedCosts.reduce(
    (total, cost) => total + cost.amount,
    0
  )
  const unresolvedResources = calculation.unresolved.filter(
    (issue) => !hideUpgraderItems || !isUpgraderItemPrefab(issue.prefab)
  )
  const isComplete =
    calculation.isComplete && stationResourceCalculation.isComplete
  const stationItemRequirements = stationRequirements.itemRequirements.filter(
    (requirement) =>
      !hideUpgraderItems || !isUpgraderItemPrefab(requirement.itemPrefab)
  )
  const groupedStationRequirements = groupStationRequirements(
    stationItemRequirements
  )
  const quickStationRequirements = groupStationRequirements(
    stationItemRequirements.filter(
      (requirement) => requirement.status === "required"
    )
  )
  const ungroupedStationRequirements = stationItemRequirements.filter(
    (requirement) => requirement.status !== "required"
  )
  const directRequirements = calculation.directRequirements.filter(
    (requirement) =>
      !hideUpgraderItems || !isUpgraderItemPrefab(requirement.prefab)
  )
  const unresolvedStationMaterials =
    stationResourceCalculation.unresolvedResources.filter(
      (issue) => !hideUpgraderItems || !isUpgraderItemPrefab(issue.prefab)
    )
  const unresolvedStationRequirements =
    stationResourceCalculation.unresolvedStationRequirements.filter(
      (requirement) =>
        !hideUpgraderItems || !isUpgraderItemPrefab(requirement.itemPrefab)
    )

  const hasStationWarning =
    unresolvedStationRequirements.length > 0 &&
    quickStationRequirements.length > 0

  function openSheet(sheet: "advanced" | "stations") {
    setActiveSheet(sheet)
    setSheetOpen(true)
  }

  function advancedBreakdownTrigger() {
    return (
      <Button
        className="h-auto px-0 py-0 text-inherit underline decoration-dotted underline-offset-2"
        onClick={() => openSheet("advanced")}
        size="sm"
        variant="link"
      >
        Advanced breakdown
      </Button>
    )
  }

  return (
    <Sheet open={sheetOpen} onOpenChange={(open) => setSheetOpen(open)}>
      <section className="mt-5 border-t border-border/70 pt-4">
        <section className="mb-4 border-b border-border/70 pb-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Stations needed</h2>
            <Button
              className="h-auto px-0 py-0 text-muted-foreground underline decoration-dotted underline-offset-2"
              onClick={() => openSheet("stations")}
              size="sm"
              variant="link"
            >
              Station breakdown
            </Button>
          </div>
          {quickStationRequirements.length > 0 ? (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {quickStationRequirements.map((group) => (
                <li
                  className="flex min-w-0 items-center justify-between gap-3 border border-border/70 px-3 py-2"
                  key={group.stationPrefab}
                >
                  <PieceRequirementsTooltip
                    pieces={[
                      getStationPiece(group.stationPrefab),
                      ...getStationUpgrades(group.stationPrefab).filter(
                        (upgrade) =>
                          group.stationLevel !== undefined &&
                          upgrade.upgradeLevel !== undefined &&
                          upgrade.upgradeLevel <= group.stationLevel
                      ),
                    ]}
                  >
                    <span className="min-w-0 font-medium break-words">
                      {humanizePrefab(
                        group.stationPrefab.replace(/^piece_/i, "")
                      )}
                    </span>
                  </PieceRequirementsTooltip>
                  {group.stationLevel !== undefined &&
                    group.stationLevel > 1 && (
                      <span className="shrink-0 text-lg font-bold text-amber-700 tabular-nums dark:text-amber-300">
                        LVL {group.stationLevel}
                      </span>
                    )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {unresolvedStationRequirements.length > 0
                ? "Station requirements need review."
                : "No stations needed."}
            </p>
          )}
          {hasStationWarning && (
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
              Some station requirements could not be resolved.{" "}
              {advancedBreakdownTrigger()}
            </p>
          )}
        </section>
        <div className="mt-4">
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-medium">
                {showCombinedCosts ? "Combined costs" : "Separate costs"}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {totalResourceAmount.toLocaleString()} total items!
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                aria-pressed={groupByType}
                onClick={() => setGroupByType((grouped) => !grouped)}
                size="sm"
                variant="outline"
              >
                {groupByType ? "Show flat list" : "Group by type"}
              </Button>
              <Button
                aria-pressed={showCombinedCosts}
                onClick={() =>
                  setShowCombinedCosts((showCombined) => !showCombined)
                }
                size="sm"
                variant="outline"
              >
                {showCombinedCosts ? "Show separately" : "Show combined"}
              </Button>
            </div>
          </div>
          {showCombinedCosts ? (
            <CostTable
              costs={combinedCosts}
              getItem={getItem}
              groupByType={groupByType}
            />
          ) : (
            <>
              <CostTable
                costs={kitResourceCosts}
                getItem={getItem}
                groupByType={groupByType}
              />
              <CostTable
                costs={stationResources}
                getItem={getItem}
                groupByType={groupByType}
              />
            </>
          )}
          <p className="mt-3 text-sm text-muted-foreground" role="status">
            {isComplete
              ? "All known recipe and station requirements are resolved."
              : "Some item sources or station costs are unresolved."}{" "}
            {!hasStationWarning && advancedBreakdownTrigger()}
          </p>
          {(unresolvedResources.length > 0 ||
            !stationResourceCalculation.isComplete) && (
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
              Totals may be incomplete.
            </p>
          )}
        </div>
        <SheetContent
          className={
            activeSheet === "stations"
              ? "w-full sm:max-w-md"
              : "w-full sm:max-w-5xl"
          }
          side={activeSheet === "stations" ? "left" : "right"}
        >
          <SheetHeader>
            <SheetTitle>
              {activeSheet === "stations"
                ? "Station breakdown"
                : "Advanced breakdown"}
            </SheetTitle>
            <SheetDescription>
              {activeSheet === "stations"
                ? "Station upgrade order and piece names."
                : "Detailed ingredients, station requirements, unresolved sources, and calculation limitations."}
            </SheetDescription>
          </SheetHeader>
          <div
            className={`min-h-0 flex-1 overflow-y-auto px-6 pb-6 ${activeSheet === "stations" ? "hidden" : ""}`}
          >
            <div>
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
                  Highest level needed for the base recipe and requested
                  quality. Station construction and upgrade materials are shown
                  separately.
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
                                  requirement.stationLevel <
                                    group.stationLevel &&
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
                        <TableHead className="pr-0 text-right">
                          Amount
                        </TableHead>
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
                {stationResourceCalculation.unresolvedStations.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-amber-800 dark:text-amber-200">
                    {stationResourceCalculation.unresolvedStations.map(
                      (issue, index) => (
                        <li
                          key={`${issue.stationPrefab}:${issue.level}:${index}`}
                        >
                          {humanizePrefab(issue.stationPrefab)}
                          {issue.level !== undefined && ` level ${issue.level}`}
                          : {stationResourceIssueLabels[issue.reason]}
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
                  {stationResourceCalculation.limitations.map((limitation) => (
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
                    ...stationResourceCalculation.limitations,
                  ].map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
          <div
            aria-label="Station upgrade paths"
            className={`min-h-0 flex-1 overflow-y-auto px-6 pb-6 ${activeSheet === "stations" ? "" : "hidden"}`}
          >
            <ol className="divide-y divide-border/70 border-y border-border/70">
              {Object.entries(stationUpgradePaths).map(
                ([stationPrefab, stationPath]) => (
                  <li className="py-3" key={stationPrefab}>
                    <h3 className="font-medium">
                      <PieceRequirementsTooltip
                        pieces={[getStationPiece(stationPrefab)]}
                      >
                        {stationPath.name}
                      </PieceRequirementsTooltip>
                    </h3>
                    <ol className="mt-2 ml-3 space-y-1 border-l border-border/70 pl-3">
                      {stationPath.upgrades.map((upgrade) => (
                        <li
                          className="flex items-baseline gap-3"
                          key={upgrade.prefab}
                        >
                          <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
                            Level {upgrade.level}
                          </span>
                          <PieceRequirementsTooltip
                            pieces={[getStationPiece(upgrade.prefab)]}
                          >
                            <span>{upgrade.name}</span>
                          </PieceRequirementsTooltip>
                        </li>
                      ))}
                    </ol>
                  </li>
                )
              )}
            </ol>
          </div>
        </SheetContent>
      </section>
    </Sheet>
  )
}
