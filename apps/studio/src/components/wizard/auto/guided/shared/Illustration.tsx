import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * One of the Add Book illustrations in `public/add-book/` (decoration: the words next to it say
 * the same). Shows `fallback` until the image loads, and keeps it if the file is missing.
 */
export function Illustration({ name, fallback, className }: { name: string; fallback?: ReactNode; className?: string }) {
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading")
  return (
    <span className={cn("relative grid h-full w-full place-items-center", className)}>
      {state !== "ok" && fallback}
      {state !== "missing" && (
        <img
          src={`/add-book/${name}.png`}
          alt=""
          aria-hidden
          draggable={false}
          onLoad={() => setState("ok")}
          onError={() => setState("missing")}
          className={cn("max-h-full max-w-full object-contain", state === "loading" && "absolute opacity-0")}
        />
      )}
    </span>
  )
}
