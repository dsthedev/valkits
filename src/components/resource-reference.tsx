import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { RiCloseLine, RiSearchLine } from "@remixicon/react"
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  filterResourceCategories,
  loadResourceGuide,
  type AcquisitionFilter,
  type ResourceGuide,
  type ResourceSort,
} from "@/data/valheim-resource-guide"

const acquisitionOptions: { value: AcquisitionFilter; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "plants", label: "Plants and crops" },
  { value: "creatures", label: "Creature drops" },
  { value: "mining", label: "Mining and gathering" },
  { value: "loot", label: "Structures and loot" },
  { value: "processed", label: "Crafted or processed" },
  { value: "unclassified", label: "Unclassified" },
]

const sortOptions: { value: ResourceSort; label: string }[] = [
  { value: "guide", label: "Guide order" },
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
  { value: "source", label: "Source A–Z" },
]

interface ResourceReferenceContextValue {
  openReference(): void
}

const ResourceReferenceContext =
  createContext<ResourceReferenceContextValue | null>(null)

export function ResourceReferenceProvider({
  children,
}: {
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [guide, setGuide] = useState<ResourceGuide | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [categoryId, setCategoryId] = useState("all")
  const [acquisition, setAcquisition] = useState<AcquisitionFilter>("all")
  const [sort, setSort] = useState<ResourceSort>("guide")
  const [openCategories, setOpenCategories] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const filteredCategories = useMemo(
    () =>
      guide
        ? filterResourceCategories(guide.categories, query, {
            categoryId,
            acquisition,
            sort,
          })
        : [],
    [guide, query, categoryId, acquisition, sort]
  )

  useEffect(() => {
    const controller = new AbortController()

    void loadResourceGuide(controller.signal)
      .then(setGuide)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(
          cause instanceof Error
            ? cause.message
            : "The resource guide could not be loaded."
        )
      })

    return () => controller.abort()
  }, [])

  function changeQuery(value: string) {
    setQuery(value)
    openSearchMatches(value, categoryId, acquisition)
  }

  function openSearchMatches(
    value: string,
    selectedCategory: string,
    selectedAcquisition: AcquisitionFilter
  ) {
    if (!value.trim() || !guide) return
    const matches = filterResourceCategories(guide.categories, value, {
      categoryId: selectedCategory,
      acquisition: selectedAcquisition,
    })
    setOpenCategories((current) => {
      const next = new Set(current)
      matches.forEach((category) => next.add(category.id))
      return next.size === current.size ? current : next
    })
  }

  function setVisibleCategoriesOpen(shouldOpen: boolean) {
    setOpenCategories((current) => {
      const next = new Set(current)
      filteredCategories.forEach((category) => {
        if (shouldOpen) next.add(category.id)
        else next.delete(category.id)
      })
      return next
    })
  }

  function highlight(text: string) {
    const keyword = query.trim()
    if (!keyword) return text

    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return text
      .split(new RegExp(`(${escapedKeyword})`, "gi"))
      .map((part, index) =>
        part.toLocaleLowerCase() === keyword.toLocaleLowerCase() ? (
          <mark
            className="rounded-sm bg-amber-300/80 px-0.5 text-foreground dark:bg-amber-300/30 dark:text-amber-100"
            key={`${index}-${part}`}
          >
            {part}
          </mark>
        ) : (
          part
        )
      )
  }

  return (
    <ResourceReferenceContext.Provider
      value={{ openReference: () => setOpen(true) }}
    >
      {children}
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent
          className="max-h-[85dvh] max-h-[85vh] overflow-hidden rounded-t-2xl border-x border-b"
          side="bottom"
        >
          <SheetHeader className="shrink-0 border-b border-border p-4 pr-14">
            <SheetTitle>Resource Reference</SheetTitle>
            <SheetDescription>
              Where to find common resources and gathering tips.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {error ? (
              <p className="py-5 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : guide ? (
              <>
                <div className="sticky top-0 z-10 -mx-4 border-b border-border bg-popover/95 px-4 py-2 backdrop-blur">
                  <div className="relative">
                    <RiSearchLine
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <label
                      className="sr-only"
                      htmlFor="resource-reference-search"
                    >
                      Search resources
                    </label>
                    <Input
                      className="h-8 rounded-md pr-8 pl-8 text-sm"
                      id="resource-reference-search"
                      onChange={(event) => changeQuery(event.target.value)}
                      placeholder="Filter resources…"
                      type="search"
                      value={query}
                    />
                    {query && (
                      <Button
                        aria-label="Clear resource search"
                        className="absolute top-1/2 right-1 size-6 -translate-y-1/2"
                        onClick={() => changeQuery("")}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <RiCloseLine aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Select
                      onValueChange={(value) => {
                        if (
                          value !== null &&
                          (value === "all" ||
                            guide.categories.some(
                              (category) => category.id === value
                            ))
                        ) {
                          setCategoryId(value)
                          openSearchMatches(query, value, acquisition)
                        }
                      }}
                      value={categoryId}
                    >
                      <SelectTrigger
                        aria-label="Filter by biome"
                        className="w-full min-w-0"
                        size="sm"
                      >
                        <SelectValue>
                          {categoryId === "all"
                            ? "All sections"
                            : guide.categories.find(
                                (category) => category.id === categoryId
                              )?.label}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sections</SelectItem>
                        {guide.categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      onValueChange={(value) => {
                        const option = acquisitionOptions.find(
                          (item) => item.value === value
                        )
                        if (option) {
                          setAcquisition(option.value)
                          openSearchMatches(query, categoryId, option.value)
                        }
                      }}
                      value={acquisition}
                    >
                      <SelectTrigger
                        aria-label="Filter by acquisition"
                        className="w-full min-w-0"
                        size="sm"
                      >
                        <SelectValue>
                          {
                            acquisitionOptions.find(
                              (option) => option.value === acquisition
                            )?.label
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {acquisitionOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      onValueChange={(value) => {
                        const option = sortOptions.find(
                          (item) => item.value === value
                        )
                        if (option) setSort(option.value)
                      }}
                      value={sort}
                    >
                      <SelectTrigger
                        aria-label="Sort resources"
                        className="w-full min-w-0"
                        size="sm"
                      >
                        <SelectValue>
                          {
                            sortOptions.find((option) => option.value === sort)
                              ?.label
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {sortOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3">
                    <Button
                      className="h-7 px-0 text-xs"
                      disabled={filteredCategories.length === 0}
                      onClick={() => setVisibleCategoriesOpen(true)}
                      type="button"
                      variant="link"
                    >
                      Expand visible
                    </Button>
                    <Button
                      className="h-7 px-0 text-xs"
                      disabled={filteredCategories.length === 0}
                      onClick={() => setVisibleCategoriesOpen(false)}
                      type="button"
                      variant="link"
                    >
                      Collapse visible
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Resources can have multiple sources.
                    </span>
                  </div>
                </div>
                {filteredCategories.length > 0 ? (
                  <div className="divide-y divide-border">
                    {filteredCategories.map((category) => (
                      <details
                        className="group py-1"
                        key={category.id}
                        onToggle={(event) => {
                          const isOpen = event.currentTarget.open
                          setOpenCategories((current) => {
                            const next = new Set(current)
                            if (isOpen) next.add(category.id)
                            else next.delete(category.id)
                            return next
                          })
                        }}
                        open={openCategories.has(category.id)}
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                          <span>{category.label}</span>
                          <span
                            aria-hidden="true"
                            className="text-muted-foreground transition-transform group-open:rotate-180"
                          >
                            ▾
                          </span>
                        </summary>
                        <div className="grid gap-x-6 pb-3 sm:grid-cols-2">
                          {(category.storageNote ||
                            category.expeditionNote) && (
                            <div className="mb-3 space-y-1 rounded-md bg-muted/50 p-3 text-xs leading-relaxed sm:col-span-2">
                              {category.storageNote && (
                                <p>
                                  <span className="font-medium">Storage:</span>{" "}
                                  {category.storageNote}
                                </p>
                              )}
                              {category.expeditionNote && (
                                <p>
                                  <span className="font-medium">
                                    Preparation:
                                  </span>{" "}
                                  {category.expeditionNote}
                                </p>
                              )}
                            </div>
                          )}
                          {category.note && (
                            <p className="mb-3 text-xs text-muted-foreground sm:col-span-2">
                              {category.note}
                            </p>
                          )}
                          {category.resources.map((resource) => (
                            <article
                              className="min-w-0 border-t border-border/60 py-2.5"
                              key={resource.name}
                            >
                              <h3 className="font-medium">
                                <a
                                  className="text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                  href={resource.wikiUrl}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  {highlight(resource.name)}
                                </a>
                              </h3>
                              <p className="mt-1 text-xs leading-relaxed">
                                <span className="font-medium">Source:</span>{" "}
                                {highlight(resource.source)}
                              </p>
                              {resource.acquisitionTypes.length === 0 && (
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  Acquisition unclassified.
                                </p>
                              )}
                              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                                <span className="font-medium text-foreground">
                                  Tip:
                                </span>{" "}
                                {highlight(resource.tip)}
                              </p>
                            </article>
                          ))}
                          {category.resources.length === 0 &&
                            !category.note && (
                              <p className="py-2 text-xs text-muted-foreground">
                                No resources listed.
                              </p>
                            )}
                        </div>
                      </details>
                    ))}
                  </div>
                ) : (
                  <p
                    className="py-5 text-sm text-muted-foreground"
                    role="status"
                  >
                    No resources match the current filters.
                  </p>
                )}
              </>
            ) : (
              <p className="py-5 text-sm text-muted-foreground" role="status">
                Loading resource guide…
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </ResourceReferenceContext.Provider>
  )
}

export function ResourceReferenceTrigger({
  className,
}: {
  className?: string
}) {
  const context = useContext(ResourceReferenceContext)

  if (!context) {
    throw new Error(
      "ResourceReferenceTrigger must be used within ResourceReferenceProvider."
    )
  }

  return (
    <Button
      className={className}
      onClick={context.openReference}
      size="sm"
      type="button"
      variant="link"
    >
      Resource Reference
    </Button>
  )
}
