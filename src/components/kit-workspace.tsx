import { useState, type FormEvent } from "react"
import {
  RiAddLine,
  RiArrowRightSLine,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiEditLine,
  RiMore2Line,
} from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ItemIcon } from "@/components/item-icon"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  biomes,
  type Biome,
  type GameItem,
  type Kit,
} from "@/domain/schema"
import { getItemGoalCapabilities } from "@/domain/item-goal-capabilities"
import type {
  ImmediateCalculationReason,
  ImmediateKitCalculation,
} from "@/domain/immediate-calculation"
import type {
  KitStationRequirementCalculation,
  StationRequirementReason,
} from "@/domain/station-requirements"
import { groupStationRequirements } from "@/domain/station-requirements"
import type { StationResourceCalculation } from "@/domain/station-resource-calculation"
import {
  isUpgraderItemPrefab,
  withoutUpgraderItemGoals,
} from "@/domain/upgrader-items"
import {
  createKit,
  updateKitDetails,
  type ItemGoalUpdates,
  type KitCollection,
} from "@/data/kits"

interface KitWorkspaceProps {
  collection: KitCollection
  warning: string | null
  excludedPrefabs: ReadonlySet<string>
  hideUpgraderItems: boolean
  sourceFingerprint: string | null
  getItem(prefab: string): GameItem | undefined
  onCreateKit(kit: Kit): void
  onSelectKit(kitId: string): void
  onUpdateKit(kit: Kit): void
  onDeleteKit(kitId: string): void
  onRemoveGoal(prefab: string): void
  onUpdateGoal(prefab: string, updates: ItemGoalUpdates): void
  onCalculateImmediate(kit: Kit): ImmediateKitCalculation
  onCalculateStationRequirements(kit: Kit): KitStationRequirementCalculation
  onCalculateStationResources(
    requirements: KitStationRequirementCalculation,
  ): StationResourceCalculation
}

interface ImmediateCalculationSnapshot {
  kitId: string
  inputFingerprint: string
  sourceFingerprint: string
  calculation: ImmediateKitCalculation
  stationRequirements: KitStationRequirementCalculation
  stationResources: StationResourceCalculation
}

const immediateReasonLabels: Record<ImmediateCalculationReason, string> = {
  "unknown-item": "Item not found in game data",
  "no-recipe": "No recipe available in the imported data",
  "disabled-recipe": "Recipe is disabled",
  "upgrade-only-recipe": "Only upgrade recipes are available",
  "ambiguous-recipe": "Multiple enabled recipes; cost is ambiguous",
  "alternative-requirements": "Alternative ingredients are not selected",
  "invalid-quantity": "Quantity is not supported for this item",
  "invalid-target-quality": "Target quality is outside the item's supported range",
  "quality-upgrades-disabled": "Recipe does not allow quality upgrades",
  "unsupported-upgrade-requirements": "Separate quality requirements are not supported yet",
  "unsupported-quality-batch": "Quality upgrades for batch outputs are not supported yet",
}

const stationRequirementReasonLabels: Record<StationRequirementReason, string> = {
  "unknown-item": "Item not found in game data",
  "no-recipe": "No recipe available in the imported data",
  "disabled-recipe": "Recipe is disabled",
  "upgrade-only-recipe": "Only upgrade recipes are available",
  "ambiguous-recipe": "Multiple enabled craft recipes",
  "ambiguous-processing-conversion": "Multiple processing conversions",
  "ambiguous-acquisition-source": "Both craft and processing sources are available",
  "processing-cycle": "Processing conversion chain loops",
  "unresolved-station": "Station reference could not be matched",
  "missing-station-level": "Recipe does not specify a minimum level",
}

const stationResourceIssueLabels = {
  "missing-station-piece": "Station piece data is missing",
  "disabled-station-piece": "Station piece is disabled",
  "missing-station-upgrade": "Required station upgrade data is missing",
  "unmapped-station-upgrade": "Station upgrade level is not verified in the source data",
  "ambiguous-station-upgrade": "Multiple upgrades match this station level",
  "disabled-station-upgrade": "Required station upgrade is disabled",
} as const

function humanizePrefab(prefab: string): string {
  return prefab
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
}

export function KitWorkspace({
  collection,
  warning,
  excludedPrefabs,
  hideUpgraderItems,
  sourceFingerprint,
  getItem,
  onCreateKit,
  onSelectKit,
  onUpdateKit,
  onDeleteKit,
  onRemoveGoal,
  onUpdateGoal,
  onCalculateImmediate,
  onCalculateStationRequirements,
  onCalculateStationResources,
}: KitWorkspaceProps) {
  const activeKit = collection.kits.find(
    (kit) => kit.id === collection.activeKitId,
  )
  const visibleGoals =
    activeKit?.itemGoals.filter(
      (goal) => !hideUpgraderItems || !isUpgraderItemPrefab(goal.prefab),
    ) ?? []
  const calculationKit = activeKit
    ? hideUpgraderItems
      ? withoutUpgraderItemGoals(activeKit)
      : activeKit
    : null
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null)
  const [nameDraft, setNameDraft] = useState("")
  const [biomeDraft, setBiomeDraft] = useState<Biome>("Meadows")
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [immediateSnapshot, setImmediateSnapshot] =
    useState<ImmediateCalculationSnapshot | null>(null)
  const [costSheetOpen, setCostSheetOpen] = useState(false)
  const [costView, setCostView] = useState<"total" | "craft" | "quality">(
    "total",
  )
  const inputFingerprint = activeKit
    ? JSON.stringify({ itemGoals: visibleGoals, hideUpgraderItems })
    : null
  const visibleSnapshot =
    activeKit && immediateSnapshot?.kitId === activeKit.id
      ? immediateSnapshot
      : null
  const calculationIsStale =
    visibleSnapshot !== null &&
    (visibleSnapshot.inputFingerprint !== inputFingerprint ||
      visibleSnapshot.sourceFingerprint !== sourceFingerprint)
  const visibleStationItemRequirements =
    visibleSnapshot?.stationRequirements.itemRequirements.filter(
      (requirement) =>
        !hideUpgraderItems || !isUpgraderItemPrefab(requirement.itemPrefab),
    ) ?? []
  const groupedStationRequirements = visibleSnapshot
    ? groupStationRequirements(visibleStationItemRequirements)
    : []
  const ungroupedStationRequirements =
    visibleStationItemRequirements.filter(
      (requirement) => requirement.status !== "required",
    )
  const displayedCalculation = visibleSnapshot
    ? {
        ...visibleSnapshot.calculation,
        requirements: visibleSnapshot.calculation.requirements.filter(
          (requirement) =>
            !hideUpgraderItems || !isUpgraderItemPrefab(requirement.prefab),
        ),
        unresolved: visibleSnapshot.calculation.unresolved.filter(
          (issue) => !hideUpgraderItems || !isUpgraderItemPrefab(issue.prefab),
        ),
      }
    : null
  const displayedStationResources = visibleSnapshot
    ? {
        ...visibleSnapshot.stationResources,
        stationResources: visibleSnapshot.stationResources.stationResources.filter(
          (resource) =>
            !hideUpgraderItems || !isUpgraderItemPrefab(resource.prefab),
        ),
        unresolvedResources:
          visibleSnapshot.stationResources.unresolvedResources.filter(
            (issue) =>
              !hideUpgraderItems || !isUpgraderItemPrefab(issue.prefab),
          ),
        unresolvedStationRequirements:
          visibleSnapshot.stationResources.unresolvedStationRequirements.filter(
            (requirement) =>
              !hideUpgraderItems ||
              !isUpgraderItemPrefab(requirement.itemPrefab),
          ),
      }
    : null

  function calculateImmediate() {
    if (!calculationKit || !inputFingerprint || sourceFingerprint === null) return
    const stationRequirements =
      onCalculateStationRequirements(calculationKit)
    setImmediateSnapshot({
      kitId: activeKit.id,
      inputFingerprint,
      sourceFingerprint,
      calculation: onCalculateImmediate(calculationKit),
      stationRequirements,
      stationResources: onCalculateStationResources(stationRequirements),
    })
    setCostSheetOpen(true)
  }

  function openForm(mode: "create" | "edit") {
    setFormMode(mode)
    setFormError(null)
    setConfirmDelete(false)
    if (mode === "edit" && activeKit) {
      setNameDraft(activeKit.name)
      setBiomeDraft(activeKit.biome)
    } else {
      setNameDraft("")
      setBiomeDraft("Meadows")
    }
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = nameDraft.trim()
    if (!name) {
      setFormError("Enter a kit name.")
      return
    }

    try {
      if (formMode === "edit" && activeKit) {
        onUpdateKit(updateKitDetails(activeKit, name, biomeDraft))
      } else {
        onCreateKit(createKit(crypto.randomUUID(), name, biomeDraft))
      }
      setFormMode(null)
      setFormError(null)
    } catch {
      setFormError("Kit details could not be saved.")
    }
  }

  function deleteActiveKit() {
    if (!activeKit) return
    onDeleteKit(activeKit.id)
    setConfirmDelete(false)
    setFormMode(null)
  }

  return (
    <section aria-label="Kit workspace" className="mb-8 border-b border-border/80 py-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            {activeKit?.biome ?? "KIT PLANNER"}
          </p>
          <h1 className="mt-1 break-words text-3xl font-semibold sm:text-4xl">
            {activeKit?.name ?? "Build your kit"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeKit
              ? `${visibleGoals.length} item goals`
              : "Create a kit to start collecting items."}
          </p>
          {warning && (
            <p className="mt-1 text-sm text-destructive" role="status">
              {warning}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeKit && (
            <details className="relative">
              <summary
                aria-label="Kit options"
                className="grid size-9 cursor-pointer list-none place-items-center rounded-lg border border-border bg-background text-foreground hover:bg-muted [&::-webkit-details-marker]:hidden"
                title="Kit options"
              >
                <RiMore2Line aria-hidden="true" />
              </summary>
              <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg">
                {collection.kits.length > 1 && (
                  <>
                    <p className="px-2 py-1 text-xs text-muted-foreground">Switch kit</p>
                    {collection.kits.map((kit) => (
                      <button
                        aria-current={kit.id === activeKit.id ? "true" : undefined}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                        key={kit.id}
                        onClick={(event) => {
                          onSelectKit(kit.id)
                          event.currentTarget.closest("details")?.removeAttribute("open")
                        }}
                        type="button"
                      >
                        <span className="min-w-0 truncate">{kit.name} · {kit.biome}</span>
                        {kit.id === activeKit.id && <RiCheckLine aria-hidden="true" />}
                      </button>
                    ))}
                    <div className="my-1 border-t border-border" />
                  </>
                )}
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                  onClick={(event) => {
                    openForm("edit")
                    event.currentTarget.closest("details")?.removeAttribute("open")
                  }}
                  type="button"
                >
                  <RiEditLine aria-hidden="true" />
                  Edit kit
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                  onClick={(event) => {
                    setConfirmDelete(true)
                    setFormMode(null)
                    event.currentTarget.closest("details")?.removeAttribute("open")
                  }}
                  type="button"
                >
                  <RiDeleteBinLine aria-hidden="true" />
                  Delete kit
                </button>
              </div>
            </details>
          )}
          <Button onClick={() => openForm("create")} variant="outline">
            <RiAddLine aria-hidden="true" />
            New kit
          </Button>
        </div>
      </div>

      {formMode && (
        <form
          className="mt-5 grid gap-4 border-t border-border/70 pt-5 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end"
          onSubmit={submitForm}
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="kit-name">
              Kit name
            </label>
            <Input
              autoFocus
              id="kit-name"
              maxLength={80}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder="Meadows starter"
              required
              value={nameDraft}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="kit-biome">
              Biome
            </label>
            <Select
              onValueChange={(value) => {
                const selectedBiome = biomes.find((biome) => biome === value)
                if (selectedBiome) setBiomeDraft(selectedBiome)
              }}
              value={biomeDraft}
            >
              <SelectTrigger aria-label="Kit biome" className="w-full" id="kit-biome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {biomes.map((biome) => (
                  <SelectItem key={biome} value={biome}>
                    {biome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">
              {formMode === "create" ? "Create kit" : "Save changes"}
            </Button>
            <Button onClick={() => setFormMode(null)} type="button" variant="outline">
              Cancel
            </Button>
          </div>
          {formError && (
            <p className="text-sm text-destructive sm:col-span-full" role="alert">
              {formError}
            </p>
          )}
        </form>
      )}

      {confirmDelete && activeKit && (
        <div
          className="mt-5 flex flex-col gap-3 border-l-2 border-destructive bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p>Delete {activeKit.name} and its item goals?</p>
          <div className="flex gap-2">
            <Button onClick={deleteActiveKit} variant="destructive">
              Delete kit
            </Button>
            <Button onClick={() => setConfirmDelete(false)} variant="outline">
              Keep kit
            </Button>
          </div>
        </div>
      )}

      {activeKit && (
        <div className="mt-5 border-t border-border/70 pt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="font-medium">Item goals</h3>
            <span className="text-sm text-muted-foreground">
              {visibleGoals.length}
            </span>
          </div>
          {visibleGoals.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {visibleGoals.map((goal) => {
                const item = getItem(goal.prefab)
                const excluded = excludedPrefabs.has(goal.prefab)
                const capabilities = item
                  ? getItemGoalCapabilities(item)
                  : { quantity: false, maxQuality: null }

                return (
                  <Card className="rounded-lg shadow-sm" key={goal.prefab}>
                    <CardContent className="flex items-center gap-2.5 p-2.5">
                      <ItemIcon prefab={goal.prefab} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="break-words text-sm leading-tight">
                            {humanizePrefab(item?.prefab ?? goal.prefab)}
                          </CardTitle>
                          <Button
                            aria-label={`Remove ${goal.prefab} from ${activeKit.name}`}
                            onClick={() => onRemoveGoal(goal.prefab)}
                            size="icon-sm"
                            title="Remove from kit"
                            variant="ghost"
                          >
                            <RiCloseLine aria-hidden="true" />
                          </Button>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          {item?.itemType && (
                            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                              {item.itemType}
                            </span>
                          )}
                          {excluded && (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900 dark:bg-amber-300/15 dark:text-amber-200">
                              Excluded
                            </span>
                          )}
                          {!item && (
                            <span className="text-xs text-muted-foreground">
                              Not in current item data
                            </span>
                          )}
                          {capabilities.quantity && (
                            <label
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                              title="Quantity"
                            >
                              Qty
                              <Input
                                aria-label={`Quantity of ${goal.prefab}`}
                                className="h-7 w-12 border-input px-1 text-center text-sm font-medium tabular-nums"
                                min={1}
                                onChange={(event) => {
                                  const value = parseGoalInput(event.target.value)
                                  if (value !== undefined) {
                                    onUpdateGoal(goal.prefab, { quantity: value })
                                  }
                                }}
                                type="number"
                                value={goal.quantity ?? 1}
                              />
                              {item?.maxStackSize && item.maxStackSize > 1 && (
                                <span className="tabular-nums">
                                  /{item.maxStackSize}
                                </span>
                              )}
                            </label>
                          )}
                          {capabilities.maxQuality !== null && (
                            <label
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                              title="Target quality"
                            >
                              LVL
                              <Input
                                aria-label={`Target quality of ${goal.prefab}`}
                                className="h-7 w-12 border-input px-1 text-center text-sm font-medium tabular-nums"
                                max={capabilities.maxQuality}
                                min={1}
                                onChange={(event) => {
                                  const value = parseGoalInput(
                                    event.target.value,
                                    capabilities.maxQuality!,
                                  )
                                  if (value !== undefined) {
                                    onUpdateGoal(goal.prefab, {
                                      targetQuality: value,
                                    })
                                  }
                                }}
                                type="number"
                                value={goal.targetQuality ?? 1}
                              />
                              <span className="tabular-nums">
                                /{capabilities.maxQuality}
                              </span>
                            </label>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <p className="border-t border-border/60 py-4 text-sm text-muted-foreground">
              {hideUpgraderItems && activeKit.itemGoals.length > 0
                ? "No visible item goals; upgrader armor/weapon items are hidden."
                : "No item goals"}
            </p>
          )}
        </div>
      )}

      {activeKit && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            disabled={visibleGoals.length === 0 || sourceFingerprint === null}
            onClick={calculateImmediate}
          >
            {visibleSnapshot ? "Recalculate direct costs" : "Calculate direct costs"}
            <RiArrowRightSLine aria-hidden="true" />
          </Button>
          {calculationIsStale && (
            <p className="text-sm text-amber-800 dark:text-amber-200" role="status">
              Costs are stale
            </p>
          )}

          <Sheet open={costSheetOpen} onOpenChange={setCostSheetOpen}>
            <SheetContent
              className="w-full overflow-y-auto sm:max-w-xl"
              side="right"
            >
              <SheetHeader className="border-b border-border">
                <SheetTitle>Direct recipe costs</SheetTitle>
                <SheetDescription>
                  {activeKit.name} · Direct ingredients only; recipe chains and station costs are not included.
                </SheetDescription>
              </SheetHeader>

              {visibleSnapshot && (
                <div className="p-4 sm:p-6">
                  {calculationIsStale && (
                    <p className="mb-3 text-sm text-amber-800 dark:text-amber-200" role="status">
                      Kit contents or game data changed. Recalculate to refresh these costs.
                    </p>
                  )}

                  <div className="mb-3 inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Cost view">
                    {(["total", "craft", "quality"] as const).map((view) => (
                      <Button
                        aria-pressed={costView === view}
                        key={view}
                        onClick={() => setCostView(view)}
                        size="sm"
                        variant={costView === view ? "secondary" : "ghost"}
                      >
                        {view === "total" ? "Total" : view === "craft" ? "Craft" : "Quality"}
                      </Button>
                    ))}
                  </div>

                  {displayedCalculation &&
                  displayedCalculation.requirements.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-0">Resource</TableHead>
                          <TableHead className="w-20 pr-0 text-right">
                            {costView === "total" ? "Total" : costView === "craft" ? "Craft" : "Quality"}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayedCalculation.requirements.map((requirement) => (
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
                      Highest base-recipe minimum per station. Quality upgrades
                      and station build or upgrade costs are not included.
                    </p>
                    {groupedStationRequirements.length > 0 ? (
                      <ul className="mt-3 divide-y divide-border/70 border-y border-border/70">
                        {groupedStationRequirements.map((group) => (
                          <li className="py-2.5" key={group.stationPrefab}>
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium">
                                {humanizePrefab(
                                  group.stationPrefab.replace(/^piece_/i, ""),
                                )}
                              </span>
                              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
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
                              <ul className="ml-4 mt-2 list-disc space-y-1">
                                {group.itemRequirements.map((requirement) => (
                                  <li key={requirement.itemPrefab}>
                                    {humanizePrefab(requirement.itemPrefab)}
                                    {requirement.stationLevel !== undefined &&
                                      group.stationLevel !== undefined &&
                                      requirement.stationLevel < group.stationLevel &&
                                      ` (level ${requirement.stationLevel})`}
                                    {requirement.targetQuality > 1 &&
                                      ` · Quality ${requirement.targetQuality}`}
                                    {requirement.outputAmountPerInput !== undefined &&
                                      ` · ${requirement.outputAmountPerInput} per base`}
                                    {requirement.reason &&
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
                                ? stationRequirementReasonLabels[
                                    requirement.reason
                                  ]
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
                      Separate from direct kit recipe costs. Includes station
                      construction, required upgrade pieces, and their item
                      recipe chains.
                    </p>
                    {displayedStationResources &&
                    displayedStationResources.stationResources.length > 0 ? (
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
                          {displayedStationResources.stationResources.map(
                            (resource) => (
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
                            ),
                          )}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No station resource totals are available.
                      </p>
                    )}
                    {visibleSnapshot.stationResources.unresolvedStations.length >
                      0 && (
                      <ul className="mt-3 space-y-1 text-xs text-amber-800 dark:text-amber-200">
                        {visibleSnapshot.stationResources.unresolvedStations.map(
                          (issue, index) => (
                            <li key={`${issue.stationPrefab}:${issue.level}:${index}`}>
                              {humanizePrefab(issue.stationPrefab)}
                              {issue.level !== undefined && ` level ${issue.level}`}:{" "}
                              {stationResourceIssueLabels[issue.reason]}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                    {displayedStationResources &&
                      displayedStationResources.unresolvedResources.length >
                      0 && (
                      <details className="mt-3 text-xs">
                        <summary className="w-fit cursor-pointer text-muted-foreground underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">
                          Unresolved station materials (
                          {displayedStationResources.unresolvedResources.length})
                        </summary>
                        <ul className="mt-2 space-y-1 text-muted-foreground">
                          {displayedStationResources.unresolvedResources.map(
                            (issue) => (
                              <li key={`${issue.prefab}:${issue.reason}`}>
                                {humanizePrefab(issue.prefab)} × {issue.amount}:{" "}
                                {issue.reason.replaceAll("-", " ")}
                              </li>
                            ),
                          )}
                        </ul>
                      </details>
                    )}
                    {displayedStationResources &&
                      displayedStationResources.unresolvedStationRequirements
                        .length > 0 && (
                      <p className="mt-3 text-xs text-amber-800 dark:text-amber-200">
                        Some kit items have unresolved station requirements; this
                        station resource list is incomplete.
                      </p>
                    )}
                    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {visibleSnapshot.stationResources.limitations.map(
                        (limitation) => (
                          <li key={limitation}>{limitation}</li>
                        ),
                      )}
                    </ul>
                  </section>

                  {displayedCalculation &&
                  displayedCalculation.unresolved.length > 0 && (
                    <div className="mt-5">
                      <h3 className="text-sm font-medium">Unresolved items</h3>
                      <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                        {displayedCalculation.unresolved.map((issue) => (
                          <li key={`${issue.prefab}:${issue.reason}`}>
                            {humanizePrefab(issue.prefab)}: {immediateReasonLabels[issue.reason]}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="mt-4 text-xs text-muted-foreground">
                    Quality totals add per-level ingredients for each requested item. Recovery flags are not subtracted.
                  </p>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      )}
    </section>
  )
}

function parseGoalInput(
  value: string,
  maximum?: number,
): number | null | undefined {
  if (value === "") return null
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) return undefined
  if (maximum !== undefined && parsed > maximum) return undefined
  return parsed
}