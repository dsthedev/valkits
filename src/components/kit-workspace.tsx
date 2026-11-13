import { useState, type FormEvent } from "react"
import { RiCloseLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  getItem(prefab: string): GameItem | undefined
  onCreateKit(kit: Kit): void
  onSelectKit(kitId: string): void
  onUpdateKit(kit: Kit): void
  onDeleteKit(kitId: string): void
  onRemoveGoal(prefab: string): void
  onUpdateGoal(prefab: string, updates: ItemGoalUpdates): void
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
  getItem,
  onCreateKit,
  onSelectKit,
  onUpdateKit,
  onDeleteKit,
  onRemoveGoal,
  onUpdateGoal,
}: KitWorkspaceProps) {
  const activeKit = collection.kits.find(
    (kit) => kit.id === collection.activeKitId,
  )
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null)
  const [nameDraft, setNameDraft] = useState("")
  const [biomeDraft, setBiomeDraft] = useState<Biome>("Meadows")
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

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
    <section
      aria-label="Kit workspace"
      className="my-7 border-y border-border/80 py-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{activeKit?.name ?? "Your kits"}</h2>
          <p className="text-sm text-muted-foreground">
            {activeKit
              ? `${activeKit.biome} · ${activeKit.itemGoals.length} item goals`
              : `${collection.kits.length} kits`}
          </p>
          {warning && (
            <p className="mt-1 text-sm text-destructive" role="status">
              {warning}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {collection.kits.length > 0 && (
            <Select
              onValueChange={(value) => {
                if (typeof value === "string") onSelectKit(value)
              }}
              value={collection.activeKitId ?? ""}
            >
              <SelectTrigger aria-label="Select active kit" className="w-56 max-w-full">
                <SelectValue placeholder="Select kit" />
              </SelectTrigger>
              <SelectContent>
                {collection.kits.map((kit) => (
                  <SelectItem key={kit.id} value={kit.id}>
                    {kit.name} ({kit.biome})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {activeKit && (
            <>
              <Button onClick={() => openForm("edit")} variant="outline">
                Edit
              </Button>
              <Button
                onClick={() => {
                  setConfirmDelete(true)
                  setFormMode(null)
                }}
                variant="destructive"
              >
                Delete
              </Button>
            </>
          )}
          <Button onClick={() => openForm("create")} variant="outline">
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
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {goal.prefab}
                      </p>
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