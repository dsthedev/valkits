import { useState } from "react"

interface ItemIconProps {
  prefab: string
  size?: "sm" | "md" | "lg" | "xl" | "2xl"
}

const sizeClasses = {
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
  xl: "size-16",
  "2xl": "size-20",
}

export function ItemIcon({ prefab, size = "md" }: ItemIconProps) {
  const [unavailable, setUnavailable] = useState(false)
  const dimensions = sizeClasses[size]

  if (unavailable) {
    return (
      <span
        aria-hidden="true"
        className={`grid ${dimensions} shrink-0 place-items-center rounded-md bg-muted text-lg font-semibold text-muted-foreground`}
      >
        {prefab.slice(0, 1).toUpperCase()}
      </span>
    )
  }

  return (
    <img
      alt=""
      aria-hidden="true"
      className={`${dimensions} shrink-0 rounded-md bg-muted/50 object-contain p-1`}
      decoding="async"
      loading="lazy"
      onError={() => setUnavailable(true)}
      src={`${import.meta.env.BASE_URL}data/icons/${encodeURIComponent(prefab)}.png`}
    />
  )
}