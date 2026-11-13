import { useState, type FormEvent } from "react"
import {
  RiAddLine,
  RiArrowRightSLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiEditLine,
  RiMore2Line,
} from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ItemIcon } from "@/components/item-icon"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  sourceFingerprint: string | null
  getItem(prefab: string): GameItem | undefined
  onCreateKit(kit: Kit): void
  onSelectKit(kitId: string): void
  onUpdateKit(kit: Kit): void
  onDeleteKit(kitId: string): void
  onRemoveGoal(prefab: string): void
  onUpdateGoal(prefab: string, updates: ItemGoalUpdates): void
  onCalculateImmediate(kit: Kit): ImmediateKitCalculation
}

interface ImmediateCalculationSnapshot {
  kitId: string
  inputFingerprint: string
  sourceFingerprint: string
  calculation: ImmediateKitCalculation
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

function humanizePrefab(prefab: string): string {
  return prefab
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
}

export function KitWorkspace({
  collection,
  warning,
  excludedPrefabs,
  sourceFingerprint,
  getItem,
  onCreateKit,
  onSelectKit,
  onUpdateKit,
  onDeleteKit,
  onRemoveGoal,
  onUpdateGoal,
  onCalculateImmediate,
}: KitWorkspaceProps) {
  const activeKit = collection.kits.find(
    (kit) => kit.id === collection.activeKitId,
  )
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
    ? JSON.stringify(activeKit.itemGoals)
    : null
  const visibleSnapshot =
    activeKit && immediateSnapshot?.kitId === activeKit.id
      ? immediateSnapshot
      : null
  const calculationIsStale =
    visibleSnapshot !== null &&
    (visibleSnapshot.inputFingerprint !== inputFingerprint ||
      visibleSnapshot.sourceFingerprint !== sourceFingerprint)

  function calculateImmediate() {
    if (!activeKit || !inputFingerprint || sourceFingerprint === null) return
    setImmediateSnapshot({
      kitId: activeKit.id,
      inputFingerprint,
      sourceFingerprint,
      calculation: onCalculateImmediate(activeKit),
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
              ? `${activeKit.itemGoals.length} item goals`
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
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label="Kit options"
                    size="icon"
                    title="Kit options"
                    variant="outline"
                  />
                }
              >
                <RiMore2Line aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {collection.kits.length > 1 && (
                  <>
                    <DropdownMenuLabel>Switch kit</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      onValueChange={onSelectKit}
                      value={collection.activeKitId ?? ""}
                    >
                      {collection.kits.map((kit) => (
                        <DropdownMenuRadioItem key={kit.id} value={kit.id}>
                          {kit.name} · {kit.biome}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => openForm("edit")}>
                    <RiEditLine aria-hidden="true" />
                    Edit kit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setConfirmDelete(true)
                      setFormMode(null)
                    }}
                    variant="destructive"
                  >
                    <RiDeleteBinLine aria-hidden="true" />
                    Delete kit
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
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
              {activeKit.itemGoals.length}
            </span>
          </div>
          {activeKit.itemGoals.length > 0 ? (
            <ul>
              {activeKit.itemGoals.map((goal) => {
                const item = getItem(goal.prefab)
                const excluded = excludedPrefabs.has(goal.prefab)
                const capabilities = item
                  ? getItemGoalCapabilities(item)
                  : { quantity: false, maxQuality: null }

                return (
                  <li
                    className="flex flex-col gap-3 border-t border-border/60 py-3 sm:flex-row sm:items-center sm:justify-between"
                    key={goal.prefab}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ItemIcon prefab={goal.prefab} size="sm" />
                      <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words text-sm font-medium">
                          {humanizePrefab(item?.prefab ?? goal.prefab)}
                        </p>
                        {excluded && (
                          <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-300/15 dark:text-amber-200">
                            Excluded
                          </span>
                        )}
                        {!item && (
                          <span className="text-xs text-muted-foreground">
                            Not in current item data
                          </span>
                        )}
                      </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      {capabilities.quantity && (
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          Quantity
                          <Input
                            aria-label={`Quantity of ${goal.prefab}`}
                            className="h-8 w-24 rounded-md px-2 text-sm"
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
                        </label>
                      )}
                      {capabilities.maxQuality !== null && (
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          Quality
                          <Input
                            aria-label={`Quality of ${goal.prefab}`}
                            className="h-8 w-20 rounded-md px-2 text-sm"
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
                        </label>
                      )}
                      <Button
                        aria-label={`Remove ${goal.prefab} from ${activeKit.name}`}
                        onClick={() => onRemoveGoal(goal.prefab)}
                        size="sm"
                        variant="ghost"
                      >
                        <RiCloseLine aria-hidden="true" />
                        Remove
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="border-t border-border/60 py-4 text-sm text-muted-foreground">
              No item goals
            </p>
          )}
        </div>
      )}

      {activeKit && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            disabled={activeKit.itemGoals.length === 0 || sourceFingerprint === null}
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

                  {visibleSnapshot.calculation.requirements.length > 0 ? (
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
                        {visibleSnapshot.calculation.requirements.map((requirement) => (
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

                  {visibleSnapshot.calculation.unresolved.length > 0 && (
                    <div className="mt-5">
                      <h3 className="text-sm font-medium">Unresolved items</h3>
                      <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                        {visibleSnapshot.calculation.unresolved.map((issue) => (
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