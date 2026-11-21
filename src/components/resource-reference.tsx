import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  loadResourceGuide,
  type ResourceGuide,
} from "@/data/valheim-resource-guide"

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

  return (
    <ResourceReferenceContext.Provider
      value={{ openReference: () => setOpen(true) }}
    >
      {children}
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent
          className="max-h-[85vh] max-h-[85dvh] overflow-hidden rounded-t-2xl border-x border-b"
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
              <div className="divide-y divide-border">
                {guide.categories.map((category) => (
                  <details className="group py-1" key={category.id}>
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
                              {resource.name}
                            </a>
                          </h3>
                          <p className="mt-1 text-xs leading-relaxed">
                            <span className="font-medium">Source:</span>{" "}
                            {resource.source}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            <span className="font-medium text-foreground">
                              Tip:
                            </span>{" "}
                            {resource.tip}
                          </p>
                        </article>
                      ))}
                      {category.resources.length === 0 && !category.note && (
                        <p className="py-2 text-xs text-muted-foreground">
                          No resources listed.
                        </p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
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
