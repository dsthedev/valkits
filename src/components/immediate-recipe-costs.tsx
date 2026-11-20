import { ItemIcon } from "@/components/item-icon"
import type { ImmediateRequirementTotal } from "@/domain/immediate-calculation"

function humanizePrefab(prefab: string): string {
  return prefab.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")
}

export function ImmediateRecipeCosts({
  requirements,
  className = "",
}: {
  requirements: readonly ImmediateRequirementTotal[]
  className?: string
}) {
  if (requirements.length === 0) return null

  return (
    <div
      aria-label="Direct recipe ingredients"
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}
    >
      {requirements.map(({ prefab, totalAmount }) => {
        const itemName = humanizePrefab(prefab)
        return (
          <span
            aria-label={`${totalAmount} ${itemName}`}
            className="inline-flex items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground"
            key={prefab}
            title={`${itemName}: ${totalAmount}`}
          >
            <ItemIcon prefab={prefab} size="xs" />
            <span>{totalAmount.toLocaleString()}</span>
          </span>
        )
      })}
    </div>
  )
}