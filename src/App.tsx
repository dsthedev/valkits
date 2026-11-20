import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react"
import {
  RiAddLine,
  RiCheckLine,
  RiCloseLine,
  RiErrorWarningLine,
  RiLoader4Line,
  RiMore2Line,
  RiSearchLine,
} from "@remixicon/react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ItemIcon } from "@/components/item-icon"
import {
  Table,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { KitWorkspace } from "@/components/kit-workspace"
import {
  addItemGoal,
  addKitToCollection,
  createExampleKit,
  exampleKitOptions,
  loadKitCollection,
  removeItemGoal,
  removeKitFromCollection,
  saveKitCollection,
  selectKit,
  updateItemGoal,
  updateKitInCollection,
  type ItemGoalUpdates,
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
import {
  loadUpgraderItemPreference,
  saveUpgraderItemPreference,
} from "@/data/upgrader-item-preference"

type CatalogState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready"
      catalog: WackyDbCatalog
    }

const ITEMS_PER_PAGE = 75

function readBrowserExclusions() {
  try {
    return loadExclusionSettings(
      typeof window === "undefined" ? undefined : window.localStorage
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

function readBrowserUpgraderItemPreference() {
  return loadUpgraderItemPreference(getBrowserStorage())
}

function humanizePrefab(prefab: string): string {
  return prefab.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")
}

export function App() {
  const [catalogState, setCatalogState] = useState<CatalogState>({
    status: "loading",
  })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [query, setQuery] = useState("")
  const [quickStartExampleId, setQuickStartExampleId] = useState(
    exampleKitOptions[0]?.id ?? ""
  )
  const [resultPage, setResultPage] = useState(0)
  const [upgraderItemPreference, setUpgraderItemPreference] = useState(
    readBrowserUpgraderItemPreference
  )
  const hideUpgraderItems = upgraderItemPreference.hideUpgraderItems
  const [exclusionState, setExclusionState] = useState(readBrowserExclusions)
  const [kitState, setKitState] = useState(readBrowserKits)
  const [manageExclusions, setManageExclusions] = useState(false)
  const [pendingImport, setPendingImport] = useState<ExclusionSettings | null>(
    null
  )
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const deferredQuery = useDeferredValue(query)
  const dataAccess = useMemo(
    () =>
      catalogState.status === "ready"
        ? createWackyDbDataAccess(catalogState.catalog, { hideUpgraderItems })
        : undefined,
    [catalogState, hideUpgraderItems]
  )
  const searchedItems = useMemo(
    () => dataAccess?.searchItems(deferredQuery) ?? [],
    [dataAccess, deferredQuery]
  )
  const results = useMemo(
    () =>
      filterExcludedItems(
        searchedItems,
        exclusionState.settings,
        manageExclusions
      ),
    [searchedItems, exclusionState.settings, manageExclusions]
  )
  const excludedPrefabs = useMemo(
    () => new Set(exclusionState.settings.excludedPrefabs),
    [exclusionState.settings.excludedPrefabs]
  )

  useEffect(() => {
    let active = true

    loadWackyDbCatalog()
      .then((catalog) => {
        if (active) {
          setCatalogState({
            status: "ready",
            catalog,
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

  const pageCount = Math.max(1, Math.ceil(results.length / ITEMS_PER_PAGE))
  const currentPage = Math.min(resultPage, pageCount - 1)
  const visibleResults = results.slice(
    currentPage * ITEMS_PER_PAGE,
    (currentPage + 1) * ITEMS_PER_PAGE
  )
  const firstVisibleResult =
    results.length === 0 ? 0 : currentPage * ITEMS_PER_PAGE + 1
  const lastVisibleResult = Math.min(
    (currentPage + 1) * ITEMS_PER_PAGE,
    results.length
  )
  const activeKit = kitState.collection.kits.find(
    (kit) => kit.id === kitState.collection.activeKitId
  )
  const unknownImportedCount =
    catalogState.status === "ready" && pendingImport
      ? pendingImport.excludedPrefabs.filter(
          (prefab) => !dataAccess?.getItem(prefab)
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
      updateKitInCollection(kitState.collection, addItemGoal(activeKit, prefab))
    )
  }

  function removeGoalFromActiveKit(prefab: string) {
    if (!activeKit) return
    persistKits(
      updateKitInCollection(
        kitState.collection,
        removeItemGoal(activeKit, prefab)
      )
    )
  }

  function updateGoalInActiveKit(prefab: string, updates: ItemGoalUpdates) {
    if (!activeKit) return
    persistKits(
      updateKitInCollection(
        kitState.collection,
        updateItemGoal(activeKit, prefab, updates)
      )
    )
  }

  function toggleUpgraderItemVisibility() {
    const nextValue = !hideUpgraderItems
    const saved = saveUpgraderItemPreference(getBrowserStorage(), nextValue)
    setUpgraderItemPreference({
      hideUpgraderItems: nextValue,
      warning: saved.success ? null : saved.message,
    })
  }

  function togglePrefabExclusion(prefab: string) {
    const settings = setPrefabExcluded(
      exclusionState.settings,
      prefab,
      !excludedPrefabs.has(prefab)
    )
    persistExclusions(settings)
  }

  function setExclusionManager(enabled: boolean) {
    setManageExclusions(enabled)
    setResultPage(0)
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
        { type: "application/json" }
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
        : "List applied for this session, but could not be saved."
    )
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a
            className="flex items-center gap-3"
            href={import.meta.env.BASE_URL}
            aria-label="Valkits home"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-emerald-800 text-sm font-bold text-white dark:bg-emerald-300 dark:text-emerald-950">
              V
            </span>
            <span className="text-base font-semibold">Valkits</span>
          </a>
          {catalogState.status === "ready" && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <details className="relative">
                <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border border-teal-700 bg-teal-700 px-3 text-sm font-medium text-white hover:bg-teal-800 dark:border-teal-300 dark:bg-teal-300 dark:text-teal-950 dark:hover:bg-teal-200 [&::-webkit-details-marker]:hidden">
                  <RiAddLine aria-hidden="true" />
                  Quick start
                </summary>
                <div className="absolute top-full right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg">
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Start from an example kit
                  </label>
                  <Select
                    onValueChange={(value) => {
                      if (value) setQuickStartExampleId(value)
                    }}
                    value={quickStartExampleId}
                  >
                    <SelectTrigger
                      aria-label="Choose an example kit"
                      className="w-full"
                    >
                      <SelectValue placeholder="Choose an example kit" />
                    </SelectTrigger>
                    <SelectContent>
                      {exampleKitOptions.map((example) => (
                        <SelectItem key={example.id} value={example.id}>
                          {example.name} · {example.biome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    className="mt-2 w-full"
                    disabled={!quickStartExampleId}
                    onClick={(event) => {
                      addNewKit(createExampleKit(quickStartExampleId))
                      event.currentTarget
                        .closest("details")
                        ?.removeAttribute("open")
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    Add example kit
                  </Button>
                </div>
              </details>
              <Button
                aria-pressed={hideUpgraderItems}
                onClick={toggleUpgraderItemVisibility}
                size="sm"
                variant={hideUpgraderItems ? "secondary" : "outline"}
              >
                {hideUpgraderItems
                  ? "Show upgrader armor/weapon"
                  : "Hide upgrader armor/weapon"}
              </Button>
              {upgraderItemPreference.warning && (
                <span
                  className="max-w-48 text-xs text-destructive"
                  role="status"
                >
                  {upgraderItemPreference.warning}
                </span>
              )}
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground sm:text-sm">
                <span>
                  {(
                    dataAccess?.searchItems("").length ??
                    catalogState.catalog.items.length
                  ).toLocaleString()}{" "}
                  items
                </span>
                <span aria-hidden="true" className="h-3 w-px bg-border" />
                <span>
                  {catalogState.catalog.recipes.length.toLocaleString()} recipes
                </span>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
        <KitWorkspace
          collection={kitState.collection}
          excludedPrefabs={excludedPrefabs}
          hideUpgraderItems={hideUpgraderItems}
          calculationData={dataAccess ?? null}
          getItem={(prefab) => dataAccess?.getItem(prefab)}
          onCreateKit={addNewKit}
          onDeleteKit={deleteKit}
          onRemoveGoal={removeGoalFromActiveKit}
          onSelectKit={selectActiveKit}
          onUpdateGoal={updateGoalInActiveKit}
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
                <p className="mt-1 text-sm break-words text-muted-foreground">
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
            <div className="mb-3 flex items-center justify-between gap-3">
              <p aria-live="polite" className="text-sm text-muted-foreground">
                {results.length.toLocaleString()}{" "}
                {manageExclusions ? "items" : "available items"}
              </p>
              <div className="flex items-center gap-2">
                {exclusionState.warning && (
                  <span
                    className="hidden text-xs text-destructive sm:inline"
                    role="status"
                  >
                    {exclusionState.warning}
                  </span>
                )}
                <details className="relative">
                  <summary
                    aria-label="Item filters and exclusions"
                    className="grid size-9 cursor-pointer list-none place-items-center rounded-lg border border-border bg-background text-foreground hover:bg-muted [&::-webkit-details-marker]:hidden"
                    title="Item filters and exclusions"
                  >
                    <RiMore2Line aria-hidden="true" />
                  </summary>
                  <div className="absolute top-full right-0 z-40 mt-2 w-64 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg">
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                      Excluded items ·{" "}
                      {exclusionState.settings.excludedPrefabs.length}
                    </p>
                    <button
                      aria-pressed={manageExclusions}
                      className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                      onClick={(event) => {
                        setExclusionManager(!manageExclusions)
                        event.currentTarget
                          .closest("details")
                          ?.removeAttribute("open")
                      }}
                      type="button"
                    >
                      Manage exclusions
                      <span aria-hidden="true">
                        {manageExclusions ? "On" : "Off"}
                      </span>
                    </button>
                    {manageExclusions && (
                      <>
                        <div className="my-1 border-t border-border" />
                        <button
                          className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                          onClick={(event) => {
                            exportExclusions()
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open")
                          }}
                          type="button"
                        >
                          Export exclusions
                        </button>
                        <button
                          className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                          onClick={(event) => {
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open")
                            importInputRef.current?.click()
                          }}
                          type="button"
                        >
                          Import exclusions
                        </button>
                      </>
                    )}
                  </div>
                </details>
                <input
                  accept="application/json,.json"
                  aria-label="Choose exclusions file"
                  className="sr-only"
                  onChange={handleExclusionFile}
                  ref={importInputRef}
                  tabIndex={-1}
                  type="file"
                />
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
                    Replace the current list with{" "}
                    {pendingImport.excludedPrefabs.length} exclusions?
                  </p>
                  {unknownImportedCount > 0 && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {unknownImportedCount} prefab IDs are not in this catalog
                      and will be kept.
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

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="w-full max-w-xl">
                <label className="sr-only" htmlFor="item-search">
                  Search items
                </label>
                <div className="flex h-11 items-center gap-3 rounded-lg border border-input bg-card px-3 shadow-sm transition-colors focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-700/15 dark:focus-within:border-emerald-300 dark:focus-within:ring-emerald-300/15">
                  <RiSearchLine
                    aria-hidden="true"
                    className="size-5 shrink-0 text-muted-foreground"
                  />
                  <Input
                    autoComplete="off"
                    className="h-full rounded-none border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-sm"
                    id="item-search"
                    onChange={(event) => {
                      setQuery(event.target.value)
                      setResultPage(0)
                    }}
                    placeholder="Search items"
                    spellCheck={false}
                    value={query}
                  />
                  {query && (
                    <Button
                      aria-label="Clear search"
                      onClick={() => {
                        setQuery("")
                        setResultPage(0)
                      }}
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
              <div className="flex flex-wrap items-center justify-end gap-3">
                <p aria-live="polite" className="text-sm text-muted-foreground">
                  Showing {firstVisibleResult.toLocaleString()}–
                  {lastVisibleResult.toLocaleString()} of{" "}
                  {results.length.toLocaleString()}
                </p>
                {pageCount > 1 && (
                  <nav
                    aria-label="Item result pages"
                    className="flex items-center gap-2"
                  >
                    <Button
                      disabled={currentPage === 0}
                      onClick={() => setResultPage(currentPage - 1)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Previous
                    </Button>
                    <span className="text-xs whitespace-nowrap text-muted-foreground">
                      Page {currentPage + 1} of {pageCount}
                    </span>
                    <Button
                      disabled={currentPage === pageCount - 1}
                      onClick={() => setResultPage(currentPage + 1)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Next
                    </Button>
                  </nav>
                )}
              </div>
            </div>

            {visibleResults.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleResults.map((item) => {
                  const isExcluded = excludedPrefabs.has(item.prefab)
                  const isInActiveKit = activeKit?.itemGoals.some(
                    (goal) => goal.prefab === item.prefab
                  )

                  return (
                    <Card
                      className="h-full rounded-lg shadow-sm"
                      key={item.prefab}
                    >
                      <CardHeader className="p-3">
                        <div className="flex items-center gap-3">
                          <ItemIcon prefab={item.prefab} size="xl" />
                          <div className="min-w-0 flex-1">
                            <CardTitle className="line-clamp-2 text-base break-words">
                              {humanizePrefab(item.prefab)}
                            </CardTitle>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                                {item.itemType ?? "Unknown type"}
                              </span>
                              {manageExclusions && isExcluded && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-300/15 dark:text-amber-200">
                                  Excluded
                                </span>
                              )}
                            </div>
                          </div>
                          {activeKit && (
                            <Button
                              aria-pressed={isInActiveKit}
                              className="h-10 shrink-0 px-4"
                              disabled={isInActiveKit}
                              onClick={() => addGoalToActiveKit(item.prefab)}
                              variant={isInActiveKit ? "secondary" : "default"}
                            >
                              {!isInActiveKit && (
                                <RiAddLine aria-hidden="true" />
                              )}
                              {isInActiveKit ? "In kit" : "Add to kit"}
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      {item.maxQuality !== undefined && item.maxQuality > 1 && (
                        <CardContent className="px-4 pt-0 pb-3">
                          <Table className="text-xs text-muted-foreground">
                            <TableBody>
                              <TableRow>
                                <TableHead
                                  className="w-28 px-1 py-1 text-xs text-muted-foreground"
                                  scope="row"
                                >
                                  Max quality
                                </TableHead>
                                <TableCell className="px-1 py-1 text-right text-xs">
                                  {item.maxQuality}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </CardContent>
                      )}
                      {manageExclusions && (
                        <CardFooter className="mt-auto flex flex-wrap justify-end gap-2 px-4 pt-0 pb-4">
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
                        </CardFooter>
                      )}
                    </Card>
                  )
                })}
              </div>
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

export default App
