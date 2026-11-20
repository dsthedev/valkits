import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  RiAddLine,
  RiCheckLine,
  RiCloseLine,
  RiMenuLine,
  RiDeleteBinLine,
  RiEditLine,
  RiMore2Line,
  RiSubtractLine,
  RiStarFill,
} from "@remixicon/react"
import { CalculationResults } from "@/components/calculation-results"
import { ImmediateRecipeCosts } from "@/components/immediate-recipe-costs"
import { ItemIcon } from "@/components/item-icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createKit,
  createKitId,
  MAX_KIT_IMPORT_LENGTH,
  parseKitExport,
  serializeKitExport,
  updateKitDetails,
  type ItemGoalUpdates,
  type KitCollection,
} from "@/data/kits"
import { getItemGoalCapabilities } from "@/domain/item-goal-capabilities"
import { getLongestFoodDurationSeconds } from "@/domain/food-duration-highlight"
import { calculateImmediateItemRequirements } from "@/domain/immediate-calculation"
import {
  calculateKitStats,
  type StatBreakdown,
} from "@/domain/kit-stat-calculation"
import { calculateKitResources } from "@/domain/resource-calculation"
import { biomes, type Biome, type GameItem, type Kit } from "@/domain/schema"
import {
  calculateKitStationRequirements,
  type StationRequirementDataAccess,
} from "@/domain/station-requirements"
import {
  calculateStationResources,
  type StationResourceDataAccess,
} from "@/domain/station-resource-calculation"
import {
  isUpgraderItemPrefab,
  withoutUpgraderItemGoals,
} from "@/domain/upgrader-items"

interface KitWorkspaceProps {
  collection: KitCollection
  warning: string | null
  excludedPrefabs: ReadonlySet<string>
  hideUpgraderItems: boolean
  calculationData:
    | (StationRequirementDataAccess &
        Pick<StationResourceDataAccess, "getStationUpgrades">)
    | null
  getItem(prefab: string): GameItem | undefined
  onScrollToItemList(): void
  onCreateKit(kit: Kit): void
  onSelectKit(kitId: string): void
  onUpdateKit(kit: Kit): void
  onDeleteKit(kitId: string): void
  onRemoveGoal(prefab: string): void
  onReorderGoals(orderedPrefabs: readonly string[]): void
  onUpdateGoal(prefab: string, updates: ItemGoalUpdates): void
}

function humanizePrefab(prefab: string): string {
  return prefab.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")
}

function formatFoodDuration(durationSeconds: number): string {
  const minutes = durationSeconds / 60
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)}m`
}

function parseGoalInput(
  value: string,
  maximum?: number
): number | null | undefined {
  if (value === "") return null
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) return undefined
  if (maximum !== undefined && parsed > maximum) return undefined
  return parsed
}

function SortableGoal({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children(dragHandle: ReactNode): ReactNode
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id })
  const dragHandle = (
    <button
      aria-label={`Drag to reorder ${label}`}
      className="inline-flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-muted-foreground hover:bg-muted active:cursor-grabbing"
      ref={setActivatorNodeRef}
      title="Drag to reorder"
      type="button"
      {...attributes}
      {...listeners}
    >
      <RiMenuLine aria-hidden="true" />
    </button>
  )

  return (
    <div
      className={isDragging ? "relative z-10 opacity-60" : undefined}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {children(dragHandle)}
    </div>
  )
}

function KitStatMetric({
  label,
  breakdown,
  footnote,
  ignoredFoodCount = 0,
}: {
  label: string
  breakdown: StatBreakdown
  footnote?: string
  ignoredFoodCount?: number
}) {
  return (
    <details className="group relative min-w-0 border-b border-border/70 px-3 py-2 first:pl-0 last:pr-0">
      <summary
        aria-label={`${label} breakdown`}
        className="flex cursor-help list-none items-baseline justify-between gap-2 [&::-webkit-details-marker]:hidden"
      >
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <strong className="text-lg tabular-nums">{breakdown.total}</strong>
      </summary>
      <div className="absolute top-full left-0 z-30 hidden w-64 max-w-[calc(100vw-2rem)] border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg group-open:block group-focus-within:block group-hover:block">
        <div className="flex justify-between gap-4">
          <span>Base</span>
          <span className="tabular-nums">{breakdown.base}</span>
        </div>
        {breakdown.contributions.map((contribution) => (
          <div
            className="mt-1 flex justify-between gap-4"
            key={contribution.prefab}
          >
            <span className="min-w-0 truncate">
              {humanizePrefab(contribution.prefab)}
            </span>
            <span className="shrink-0 tabular-nums">+{contribution.value}</span>
          </div>
        ))}
        {ignoredFoodCount > 0 && (
          <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            {ignoredFoodCount} additional food goal
            {ignoredFoodCount === 1 ? "" : "s"} not counted; only three food
            slots are active.
          </p>
        )}
      </div>
      {footnote && (
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {footnote}
        </p>
      )}
    </details>
  )
}

function GoalStepper({
  itemName,
  label,
  value,
  maximum,
  maxLabel,
  tone,
  onValueChange,
}: {
  itemName: string
  label: string
  value: number
  maximum?: number
  maxLabel: number
  tone: "quantity" | "quality"
  onValueChange(value: number | null): void
}) {
  const toneClass =
    tone === "quantity"
      ? "border-amber-400/70 bg-amber-100/70 text-amber-950 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100"
      : "border-border bg-muted/70 text-muted-foreground"

  return (
    <div className="flex items-center gap-1.5">
      <span className="min-w-8 text-[10px] font-semibold tracking-wide text-muted-foreground">
        {label}
      </span>
      <div
        aria-label={`${label} of ${itemName}`}
        className={`inline-flex h-9 items-center gap-0.5 border px-0.5 ${toneClass}`}
        role="group"
      >
        <Button
          aria-label={`Decrease ${label.toLowerCase()} of ${itemName}`}
          className="rounded-sm"
          disabled={value <= 1}
          onClick={() => onValueChange(value - 1)}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <RiSubtractLine aria-hidden="true" />
        </Button>
        <Input
          aria-label={`${label} of ${itemName}`}
          className="goal-number-input h-8 w-12 rounded-none border-0 bg-transparent px-0 text-center text-lg font-bold tabular-nums shadow-none focus-visible:ring-0"
          max={maximum}
          min={1}
          onChange={(event) => {
            const parsed = parseGoalInput(event.target.value, maximum)
            if (parsed !== undefined) onValueChange(parsed)
          }}
          type="number"
          value={value}
        />
        <span className="pr-1 text-sm font-semibold tabular-nums opacity-70">
          /{maxLabel}
        </span>
        <Button
          aria-label={`Increase ${label.toLowerCase()} of ${itemName}`}
          className="rounded-sm"
          disabled={maximum !== undefined && value >= maximum}
          onClick={() => onValueChange(value + 1)}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <RiAddLine aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

export function KitWorkspace({
  collection,
  warning,
  excludedPrefabs,
  hideUpgraderItems,
  calculationData,
  getItem,
  onScrollToItemList,
  onCreateKit,
  onSelectKit,
  onUpdateKit,
  onDeleteKit,
  onRemoveGoal,
  onReorderGoals,
  onUpdateGoal,
}: KitWorkspaceProps) {
  const activeKit = collection.kits.find(
    (kit) => kit.id === collection.activeKitId
  )
  const visibleGoals =
    activeKit?.itemGoals.filter(
      (goal) => !hideUpgraderItems || !isUpgraderItemPrefab(goal.prefab)
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
  const [pendingImportedKit, setPendingImportedKit] = useState<Kit | null>(null)
  const [kitFileError, setKitFileError] = useState<string | null>(null)
  const [kitFileMessage, setKitFileMessage] = useState<string | null>(null)
  const kitImportInputRef = useRef<HTMLInputElement>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const liveCalculation =
    activeKit && calculationKit && calculationData
      ? calculateKitResources(calculationKit, calculationData)
      : null
  const liveStationRequirements =
    activeKit && calculationKit && calculationData
      ? calculateKitStationRequirements(calculationKit, calculationData)
      : null
  const liveStationResources =
    liveStationRequirements && calculationData
      ? calculateStationResources(
          liveStationRequirements.itemRequirements,
          calculationData
        )
      : null
  const liveStats = activeKit ? calculateKitStats(activeKit, getItem) : null
  const longestFoodDurationSeconds = activeKit
    ? getLongestFoodDurationSeconds(
        activeKit.itemGoals.flatMap((goal) => {
          const item = getItem(goal.prefab)
          return item ? [item] : []
        })
      )
    : null

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
        onCreateKit(createKit(createKitId(), name, biomeDraft))
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

  function handleKitImportFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ""
    if (!file) return

    setPendingImportedKit(null)
    setKitFileError(null)
    setKitFileMessage(null)
    if (file.size > MAX_KIT_IMPORT_LENGTH) {
      setKitFileError("The kit file is too large.")
      return
    }

    void file
      .text()
      .then((text) => {
        const result = parseKitExport(text)
        if (result.success) setPendingImportedKit(result.kit)
        else setKitFileError(result.message)
      })
      .catch(() => setKitFileError("The kit file could not be read."))
  }

  function exportActiveKit() {
    if (!activeKit) return

    try {
      const file = new Blob([serializeKitExport(activeKit)], {
        type: "application/json",
      })
      const objectUrl = URL.createObjectURL(file)
      const downloadLink = document.createElement("a")
      const filename = activeKit.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
      downloadLink.href = objectUrl
      downloadLink.download = `valkits-${filename || "kit"}.json`
      downloadLink.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
      setKitFileMessage(`Exported "${activeKit.name}".`)
      setKitFileError(null)
    } catch {
      setKitFileError("The kit file could not be exported.")
    }
  }

  function confirmKitImport() {
    if (!pendingImportedKit) return
    const importedKit: Kit = { ...pendingImportedKit, id: createKitId() }
    onCreateKit(importedKit)
    setPendingImportedKit(null)
    setKitFileMessage(`Added "${importedKit.name}" to your kits.`)
    setKitFileError(null)
  }

  function handleGoalDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const visiblePrefabs = visibleGoals.map((goal) => goal.prefab)
    const activeIndex = visiblePrefabs.indexOf(String(active.id))
    const overIndex = visiblePrefabs.indexOf(String(over.id))
    if (activeIndex < 0 || overIndex < 0) return

    onReorderGoals(arrayMove(visiblePrefabs, activeIndex, overIndex))
  }

  return (
    <section
      aria-label="Kit workspace"
      className="mb-8 border-b border-border/80 py-6"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            {activeKit?.biome ?? "KIT PLANNER"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold break-words sm:text-4xl">
              {activeKit?.name ?? "Plan your next expedition"}
            </h1>
            {activeKit && (
              <details className="relative">
                <summary
                  aria-label="Kit options"
                  className="inline-flex h-8 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-muted-foreground hover:bg-muted [&::-webkit-details-marker]:hidden"
                  title="Kit options"
                >
                  <RiMore2Line aria-hidden="true" />
                  <span className="text-xs">Kit options</span>
                </summary>
                <div className="absolute top-full left-0 z-40 mt-2 w-64 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg">
                  {collection.kits.length > 1 && (
                    <>
                      <p className="px-2 py-1 text-xs text-muted-foreground">
                        Switch kit
                      </p>
                      {collection.kits.map((kit) => (
                        <button
                          aria-current={
                            kit.id === activeKit.id ? "true" : undefined
                          }
                          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                          key={kit.id}
                          onClick={(event) => {
                            onSelectKit(kit.id)
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open")
                          }}
                          type="button"
                        >
                          <span className="min-w-0 truncate">
                            {kit.name} · {kit.biome}
                          </span>
                          {kit.id === activeKit.id && (
                            <RiCheckLine aria-hidden="true" />
                          )}
                        </button>
                      ))}
                      <div className="my-1 border-t border-border" />
                    </>
                  )}
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                    onClick={(event) => {
                      openForm("edit")
                      event.currentTarget
                        .closest("details")
                        ?.removeAttribute("open")
                    }}
                    type="button"
                  >
                    <RiEditLine aria-hidden="true" />
                    Edit kit
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                    onClick={(event) => {
                      exportActiveKit()
                      event.currentTarget
                        .closest("details")
                        ?.removeAttribute("open")
                    }}
                    type="button"
                  >
                    Export kit
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                    onClick={(event) => {
                      setConfirmDelete(true)
                      setFormMode(null)
                      event.currentTarget
                        .closest("details")
                        ?.removeAttribute("open")
                    }}
                    type="button"
                  >
                    <RiDeleteBinLine aria-hidden="true" />
                    Delete kit
                  </button>
                </div>
              </details>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeKit
              ? `${visibleGoals.length} item goals`
              : "Create a kit for a biome or progression milestone, add the gear and supplies you want, then calculate the resources and stations needed to prepare."}
          </p>
          {warning && (
            <p className="mt-1 text-sm text-destructive" role="status">
              {warning}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="font-semibold shadow-sm"
            onClick={() => openForm("create")}
            size="lg"
          >
            <RiAddLine aria-hidden="true" />
            New kit
          </Button>
          <Button
            onClick={() => kitImportInputRef.current?.click()}
            size="sm"
            variant="outline"
          >
            Import kit
          </Button>
        </div>
      </div>

      <input
        accept="application/json,.json"
        aria-label="Choose kit file"
        className="sr-only"
        onChange={handleKitImportFile}
        ref={kitImportInputRef}
        tabIndex={-1}
        type="file"
      />
      {kitFileError && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {kitFileError}
        </p>
      )}
      {kitFileMessage && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {kitFileMessage}
        </p>
      )}
      {pendingImportedKit && (
        <div className="mt-4 flex flex-col gap-3 border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            Add "{pendingImportedKit.name}" ({pendingImportedKit.biome},{" "}
            {pendingImportedKit.itemGoals.length} item goals) as a new kit?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirmKitImport}>Add kit</Button>
            <Button
              onClick={() => setPendingImportedKit(null)}
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {formMode && (
        <form
          className="mt-5 grid gap-4 border-t border-border/70 pt-5 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end"
          onSubmit={submitForm}
        >
          <div>
            <label
              className="mb-1.5 block text-sm font-medium"
              htmlFor="kit-name"
            >
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
            <label
              className="mb-1.5 block text-sm font-medium"
              htmlFor="kit-biome"
            >
              Biome
            </label>
            <Select
              onValueChange={(value) => {
                const selectedBiome = biomes.find((biome) => biome === value)
                if (selectedBiome) setBiomeDraft(selectedBiome)
              }}
              value={biomeDraft}
            >
              <SelectTrigger
                aria-label="Kit biome"
                className="w-full"
                id="kit-biome"
              >
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
            <Button
              onClick={() => setFormMode(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
          {formError && (
            <p
              className="text-sm text-destructive sm:col-span-full"
              role="alert"
            >
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

      {activeKit && calculationData && liveStats && (
        <div
          aria-label="Kit stat estimate"
          className="mt-5 grid grid-cols-2 border-y border-border/70 sm:grid-cols-4"
        >
          <KitStatMetric
            breakdown={liveStats.health}
            ignoredFoodCount={liveStats.ignoredFoodCount}
            label="Health"
          />
          <KitStatMetric
            breakdown={liveStats.stamina}
            ignoredFoodCount={liveStats.ignoredFoodCount}
            label="Stamina"
          />
          <KitStatMetric
            breakdown={liveStats.eitr}
            ignoredFoodCount={liveStats.ignoredFoodCount}
            label="Eitr"
          />
          <KitStatMetric
            breakdown={liveStats.armor}
            footnote={
              liveStats.shield
                ? `Block ${liveStats.shield.blockPower} · Deflect ${liveStats.shield.deflectionForce}`
                : undefined
            }
            label="Armor"
          />
        </div>
      )}

      {activeKit && (
        <div className="mt-5 grid gap-6 border-t border-border/70 pt-4 md:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] md:items-start">
          <div className="min-w-0 md:sticky md:top-4 md:self-start">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="font-medium">Item goals</h2>
              <span className="text-sm text-muted-foreground">
                {visibleGoals.length}
              </span>
            </div>
            {visibleGoals.length > 0 ? (
              <DndContext
                collisionDetection={closestCenter}
                onDragEnd={handleGoalDragEnd}
                sensors={sensors}
              >
                <SortableContext
                  items={visibleGoals.map((goal) => goal.prefab)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="grid gap-3">
                    {visibleGoals.map((goal) => {
                      const item = getItem(goal.prefab)
                      const directRequirements = calculationData
                        ? calculateImmediateItemRequirements(
                            goal,
                            calculationData
                          ).requirements
                        : []
                      const capabilities = item
                        ? getItemGoalCapabilities(item)
                        : { quantity: false, maxQuality: null }
                      return (
                        <SortableGoal
                          id={goal.prefab}
                          key={goal.prefab}
                          label={humanizePrefab(goal.prefab)}
                        >
                          {(dragHandle) => (
                            <Card className="rounded-lg shadow-sm">
                              <CardContent className="p-2.5">
                                <div className="flex items-center gap-2.5">
                                  <ItemIcon prefab={goal.prefab} size="xl" />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start gap-2">
                                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                                        <CardTitle className="text-sm leading-tight break-words">
                                          {humanizePrefab(
                                            item?.prefab ?? goal.prefab
                                          )}
                                        </CardTitle>
                                        {item?.itemType && (
                                          <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                                            {item.itemType}
                                          </span>
                                        )}
                                        {item?.foodStats?.durationSeconds !==
                                          undefined &&
                                          item.foodStats.durationSeconds >
                                            0 && (
                                            <span
                                              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-100/70 px-1.5 py-0.5 text-[10px] font-medium text-amber-950 tabular-nums dark:bg-amber-300/10 dark:text-amber-100"
                                              title={
                                                item.foodStats
                                                  .durationSeconds ===
                                                longestFoodDurationSeconds
                                                  ? "Longest food duration in this kit"
                                                  : "Food duration"
                                              }
                                            >
                                              {formatFoodDuration(
                                                item.foodStats.durationSeconds
                                              )}
                                              {item.foodStats
                                                .durationSeconds ===
                                                longestFoodDurationSeconds && (
                                                <RiStarFill
                                                  aria-hidden="true"
                                                  className="size-3 text-amber-500"
                                                />
                                              )}
                                            </span>
                                          )}
                                      </div>
                                      {dragHandle}
                                      <Button
                                        aria-label={`Remove ${goal.prefab} from ${activeKit.name}`}
                                        onClick={() =>
                                          onRemoveGoal(goal.prefab)
                                        }
                                        size="icon-sm"
                                        title="Remove from kit"
                                        variant="ghost"
                                      >
                                        <RiCloseLine aria-hidden="true" />
                                      </Button>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                      {excludedPrefabs.has(goal.prefab) && (
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
                                        <GoalStepper
                                          itemName={goal.prefab}
                                          label="Qty"
                                          maxLabel={item?.maxStackSize ?? 1}
                                          onValueChange={(quantity) =>
                                            onUpdateGoal(goal.prefab, {
                                              quantity,
                                            })
                                          }
                                          tone="quantity"
                                          value={goal.quantity ?? 1}
                                        />
                                      )}
                                      {capabilities.maxQuality !== null && (
                                        <GoalStepper
                                          itemName={goal.prefab}
                                          label="LVL"
                                          maxLabel={capabilities.maxQuality}
                                          maximum={capabilities.maxQuality}
                                          onValueChange={(targetQuality) =>
                                            onUpdateGoal(goal.prefab, {
                                              targetQuality,
                                            })
                                          }
                                          tone="quality"
                                          value={goal.targetQuality ?? 1}
                                        />
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {directRequirements.length > 0 && (
                                  <ImmediateRecipeCosts
                                    className="mt-2 border-t border-border/60 pt-2"
                                    requirements={directRequirements}
                                  />
                                )}
                              </CardContent>
                            </Card>
                          )}
                        </SortableGoal>
                      )
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <p className="border-t border-border/60 py-4 text-sm text-muted-foreground">
                {hideUpgraderItems && activeKit.itemGoals.length > 0
                  ? "No visible item goals; upgrader armor/weapon items are hidden."
                  : "No item goals"}
              </p>
            )}
            <div className="mt-4 flex justify-center border-t border-border/60 pt-4">
              <Button
                className="w-full max-w-sm border-orange-700 bg-orange-600 font-semibold text-white shadow-sm hover:bg-orange-700 dark:border-orange-300 dark:bg-orange-400 dark:text-orange-950 dark:hover:bg-orange-300"
                onClick={onScrollToItemList}
                size="lg"
                type="button"
              >
                <RiAddLine aria-hidden="true" />
                Add items
              </Button>
            </div>
          </div>
          <div className="min-w-0 md:sticky md:top-4 md:self-start">
            {calculationData === null && (
              <p className="mt-4 text-sm text-muted-foreground" role="status">
                Live costs will appear when item data is ready.
              </p>
            )}
            {calculationData &&
              liveCalculation &&
              liveStationRequirements &&
              liveStationResources && (
                <CalculationResults
                  calculation={liveCalculation}
                  getItem={getItem}
                  getStationPiece={calculationData.getStationPiece}
                  getStationUpgrades={calculationData.getStationUpgrades}
                  hideUpgraderItems={hideUpgraderItems}
                  stationRequirements={liveStationRequirements}
                  stationResourceCalculation={liveStationResources}
                />
              )}
          </div>
        </div>
      )}
    </section>
  )
}
