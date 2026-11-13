import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react"
import {
  RiCheckLine,
  RiCloseLine,
  RiDownloadLine,
  RiErrorWarningLine,
  RiFilterLine,
  RiLoader4Line,
  RiSearchLine,
  RiUploadLine,
} from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { KitWorkspace } from "@/components/kit-workspace"
import {
  addItemGoal,
  addKitToCollection,
  loadKitCollection,
  removeItemGoal,
  removeKitFromCollection,
  saveKitCollection,
  selectKit,
  updateKitInCollection,
  type KitCollection,
} from "@/data/kits"
import { type Kit } from "@/domain/schema"
import {
  createWackyDbDataAccess,
  loadWackyDbCatalog,
  type WackyDbCatalog,
} from "@/data/wackydb-catalog"
import {
  MAX_EXCLUSION_IMPORT_LENGTH,
  filterExcludedItems,
  loadExclusionSettings,
  parseExclusionExport,
  saveExclusionSettings,
  serializeExclusionExport,
  setPrefabExcluded,
  type ExclusionSettings,
} from "@/data/exclusions"

type CatalogState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready"
      catalog: WackyDbCatalog
      dataAccess: ReturnType<typeof createWackyDbDataAccess>
    }

const MAX_VISIBLE_ITEMS = 75

function readBrowserExclusions() {
  try {
    return loadExclusionSettings(
      typeof window === "undefined" ? undefined : window.localStorage,
    )
  } catch {
    return loadExclusionSettings(undefined)
  }
}

function getBrowserStorage() {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function readBrowserKits() {
  return loadKitCollection(getBrowserStorage())
}

function humanizePrefab(prefab: string): string {
  return prefab
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
}

export function App() {
  const [catalogState, setCatalogState] = useState<CatalogState>({
    status: "loading",
  })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [query, setQuery] = useState("")
  const [exclusionState, setExclusionState] = useState(readBrowserExclusions)
  const [kitState, setKitState] = useState(readBrowserKits)
  const [manageExclusions, setManageExclusions] = useState(false)
  const [pendingImport, setPendingImport] = useState<ExclusionSettings | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    let active = true

    loadWackyDbCatalog()
      .then((catalog) => {
        if (active) {
          setCatalogState({
            status: "ready",
            catalog,
            dataAccess: createWackyDbDataAccess(catalog),
          })
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setCatalogState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "The item catalog could not be loaded.",
          })
        }
      })

    return () => {
      active = false
    }
  }, [loadAttempt])

  const searchedItems =
    catalogState.status === "ready"
      ? catalogState.dataAccess.searchItems(deferredQuery)
      : []
  const results = filterExcludedItems(
    searchedItems,
    exclusionState.settings,
    manageExclusions,
  )
  const visibleResults = results.slice(0, MAX_VISIBLE_ITEMS)
  const excludedPrefabs = new Set(exclusionState.settings.excludedPrefabs)
  const activeKit = kitState.collection.kits.find(
    (kit) => kit.id === kitState.collection.activeKitId,
  )
  const unknownImportedCount =
    catalogState.status === "ready" && pendingImport
      ? pendingImport.excludedPrefabs.filter(
          (prefab) => !catalogState.dataAccess.getItem(prefab),
        ).length
      : 0

  function retryCatalogLoad() {
    setCatalogState({ status: "loading" })
    setLoadAttempt((attempt) => attempt + 1)
  }

  function persistExclusions(settings: ExclusionSettings): boolean {
    const saved = saveExclusionSettings(getBrowserStorage(), settings)
    setExclusionState({
      settings,
      warning: saved.success ? null : saved.message,
    })
    return saved.success
  }

  function persistKits(collection: KitCollection) {
    const saved = saveKitCollection(getBrowserStorage(), collection)
    setKitState({
      collection,
      warning: saved.success ? null : saved.message,
    })
  }

  function addNewKit(kit: Kit) {
    const withKit = addKitToCollection(kitState.collection, kit)
    persistKits(selectKit(withKit, kit.id))
  }

  function selectActiveKit(kitId: string) {
    persistKits(selectKit(kitState.collection, kitId))
  }

  function updateExistingKit(kit: Kit) {
    persistKits(updateKitInCollection(kitState.collection, kit))
  }

  function deleteKit(kitId: string) {
    persistKits(removeKitFromCollection(kitState.collection, kitId))
  }

  function addGoalToActiveKit(prefab: string) {
    if (!activeKit) return
    persistKits(
      updateKitInCollection(
        kitState.collection,
        addItemGoal(activeKit, prefab),
      ),
    )
  }

  function removeGoalFromActiveKit(prefab: string) {
    if (!activeKit) return
    persistKits(
      updateKitInCollection(
        kitState.collection,
        removeItemGoal(activeKit, prefab),
      ),
    )
  }

  function togglePrefabExclusion(prefab: string) {
    const settings = setPrefabExcluded(
      exclusionState.settings,
      prefab,
      !excludedPrefabs.has(prefab),
    )
    persistExclusions(settings)
  }

  function toggleExclusionManager() {
    const nextMode = !manageExclusions
    setManageExclusions(nextMode)
    setPendingImport(null)
    setImportMessage(null)
    setImportError(null)
  }

  function handleExclusionFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ""
    if (!file) return

    setPendingImport(null)
    setImportMessage(null)
    setImportError(null)
    if (file.size > MAX_EXCLUSION_IMPORT_LENGTH) {
      setImportError("The exclusions file is too large.")
      return
    }

    void file
      .text()
      .then((text) => {
        const result = parseExclusionExport(text)
        if (result.success) {
          setPendingImport(result.settings)
        } else {
          setImportError(result.message)
        }
      })
      .catch(() => {
        setImportError("The exclusions file could not be read.")
      })
  }

  function exportExclusions() {
    setImportError(null)
    setImportMessage(null)
    try {
      const file = new Blob(
        [serializeExclusionExport(exclusionState.settings)],
        { type: "application/json" },
      )
      const objectUrl = URL.createObjectURL(file)
      const downloadLink = document.createElement("a")
      downloadLink.href = objectUrl
      downloadLink.download = "valkits-exclusions.json"
      downloadLink.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    } catch {
      setImportError("The exclusions file could not be exported.")
    }
  }

  function confirmExclusionImport() {
    if (!pendingImport) return

    const saved = persistExclusions(pendingImport)
    setPendingImport(null)
    setImportMessage(
      saved
        ? "Exclusion list replaced."
        : "List applied for this session, but could not be saved.",
    )
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a className="flex items-center gap-3" href="/" aria-label="Valkits home">
            <span className="grid size-9 place-items-center rounded-lg bg-emerald-800 text-sm font-bold text-white dark:bg-emerald-300 dark:text-emerald-950">
              V
            </span>
            <span className="text-base font-semibold">Valkits</span>
          </a>
          {catalogState.status === "ready" && (
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground sm:text-sm">
              <span>{catalogState.catalog.items.length.toLocaleString()} items</span>
              <span aria-hidden="true" className="h-3 w-px bg-border" />
              <span>{catalogState.catalog.recipes.length.toLocaleString()} recipes</span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <div className="flex flex-col gap-5 border-b border-border/80 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              GAME DATA
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Item index</h1>
          </div>

          <div className="w-full sm:max-w-xl sm:flex-1">
            <label className="sr-only" htmlFor="item-search">
              Search items
            </label>
            <div className="flex h-12 items-center gap-3 rounded-lg border border-input bg-card px-3 shadow-sm transition-colors focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-700/15 dark:focus-within:border-emerald-300 dark:focus-within:ring-emerald-300/15">
              <RiSearchLine
                aria-hidden="true"
                className="size-5 shrink-0 text-muted-foreground"
              />
              <Input
                autoComplete="off"
                className="h-full rounded-none border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-sm"
                id="item-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by item, type, or prefab"
                spellCheck={false}
                value={query}
              />
              {query && (
                <Button
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  size="icon-sm"
                  title="Clear search"
                  type="button"
                  variant="ghost"
                >
                  <RiCloseLine aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <KitWorkspace
          collection={kitState.collection}
          excludedPrefabs={excludedPrefabs}
          getItem={(prefab) =>
            catalogState.status === "ready"
              ? catalogState.dataAccess.getItem(prefab)
              : undefined
          }
          onCreateKit={addNewKit}
          onDeleteKit={deleteKit}
          onRemoveGoal={removeGoalFromActiveKit}
          onSelectKit={selectActiveKit}
          onUpdateKit={updateExistingKit}
          warning={kitState.warning}
        />

        {catalogState.status === "loading" && (
          <div
            aria-live="polite"
            className="flex items-center gap-3 py-12 text-sm text-muted-foreground"
            role="status"
          >
            <RiLoader4Line
              aria-hidden="true"
              className="size-5 animate-spin motion-reduce:animate-none"
            />
            Loading item catalog
          </div>
        )}

        {catalogState.status === "error" && (
          <div className="mt-8 flex flex-col gap-4 border-l-2 border-destructive bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <RiErrorWarningLine
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-destructive"
              />
              <div className="min-w-0">
                <h2 className="font-medium">Catalog unavailable</h2>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  {catalogState.message}
                </p>
              </div>
            </div>
            <Button onClick={retryCatalogLoad} variant="outline">
              Retry
            </Button>
          </div>
        )}

        {catalogState.status === "ready" && (
          <section aria-label="Item search results" className="mt-5">
            <div className="flex flex-col gap-3 border-b border-border/80 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Item exclusions</p>
                <p className="text-sm text-muted-foreground">
                  {exclusionState.settings.excludedPrefabs.length.toLocaleString()} excluded
                </p>
                {exclusionState.warning && (
                  <p className="mt-1 text-sm text-destructive" role="status">
                    {exclusionState.warning}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {manageExclusions && (
                  <>
                    <Button onClick={exportExclusions} variant="outline">
                      <RiDownloadLine aria-hidden="true" />
                      Export
                    </Button>
                    <Button
                      onClick={() => importInputRef.current?.click()}
                      variant="outline"
                    >
                      <RiUploadLine aria-hidden="true" />
                      Import
                    </Button>
                    <input
                      accept="application/json,.json"
                      aria-label="Choose exclusions file"
                      className="sr-only"
                      onChange={handleExclusionFile}
                      ref={importInputRef}
                      tabIndex={-1}
                      type="file"
                    />
                  </>
                )}
                <Button
                  aria-pressed={manageExclusions}
                  onClick={toggleExclusionManager}
                  variant={manageExclusions ? "secondary" : "outline"}
                >
                  <RiFilterLine aria-hidden="true" />
                  {manageExclusions ? "Done" : "Manage exclusions"}
                </Button>
              </div>
            </div>

            {importError && (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {importError}
              </p>
            )}
            {importMessage && (
              <p className="mt-3 text-sm text-muted-foreground" role="status">
                {importMessage}
              </p>
            )}
            {pendingImport && (
              <div className="mt-4 flex flex-col gap-3 border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    Replace the current list with {pendingImport.excludedPrefabs.length} exclusions?
                  </p>
                  {unknownImportedCount > 0 && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {unknownImportedCount} prefab IDs are not in this catalog and will be kept.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={confirmExclusionImport}>Replace list</Button>
                  <Button
                    onClick={() => setPendingImport(null)}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div
              aria-live="polite"
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 py-3 text-sm"
            >
              <p className="font-medium">
                {results.length.toLocaleString()} {manageExclusions ? "items" : "available items"}
              </p>
              <p className="text-muted-foreground">
                Showing {visibleResults.length.toLocaleString()}
                {results.length > MAX_VISIBLE_ITEMS
                  ? ` of ${results.length.toLocaleString()}`
                  : ""}
              </p>
            </div>

            {visibleResults.length > 0 ? (
              <ul>
                {visibleResults.map((item) => {
                  const recipeCount = catalogState.dataAccess.getRecipes(
                    item.prefab,
                  ).length
                  const isExcluded = excludedPrefabs.has(item.prefab)
                  const isInActiveKit = activeKit?.itemGoals.some(
                    (goal) => goal.prefab === item.prefab,
                  )

                  return (
                    <li
                      className="grid gap-3 border-b border-border/70 py-4 sm:grid-cols-[minmax(0,1fr)_repeat(4,5rem)_auto] sm:items-center"
                      key={item.prefab}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="break-words font-medium">
                            {humanizePrefab(item.prefab)}
                          </h2>
                          {manageExclusions && isExcluded && (
                            <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-300/15 dark:text-amber-200">
                              Excluded
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                          {item.prefab}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:contents">
                        <ItemFact label="Type" value={item.itemType ?? "Not set"} />
                        <ItemFact
                          label="Stack"
                          value={item.maxStackSize?.toLocaleString() ?? "Not set"}
                        />
                        <ItemFact
                          label="Quality"
                          value={item.maxQuality?.toLocaleString() ?? "Not set"}
                        />
                        <ItemFact label="Recipes" value={recipeCount.toString()} />
                      </div>
                      {(activeKit || manageExclusions) && (
                        <div className="col-span-2 flex flex-wrap justify-end gap-2 sm:col-span-1">
                          {activeKit && (
                            <Button
                              aria-pressed={isInActiveKit}
                              disabled={isInActiveKit}
                              onClick={() => addGoalToActiveKit(item.prefab)}
                              size="sm"
                              variant={isInActiveKit ? "secondary" : "outline"}
                            >
                              {isInActiveKit ? "In kit" : "Add to kit"}
                            </Button>
                          )}
                          {manageExclusions && (
                            <Button
                              aria-pressed={isExcluded}
                              onClick={() => togglePrefabExclusion(item.prefab)}
                              size="sm"
                              variant={isExcluded ? "secondary" : "outline"}
                            >
                              {isExcluded ? (
                                <RiCheckLine aria-hidden="true" />
                              ) : (
                                <RiCloseLine aria-hidden="true" />
                              )}
                              {isExcluded ? "Restore" : "Exclude"}
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No items match this search.
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

function ItemFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm">{value}</p>
    </div>
  )
}

export default App
