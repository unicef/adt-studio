import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { Trans } from "@lingui/react/macro"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CopyState = "idle" | "copied" | "error"

export function CopyTextButton({
  value,
  children,
  tone = "red",
  primary = false,
}: {
  value: string
  children: ReactNode
  tone?: "red" | "amber"
  primary?: boolean
}) {
  const [state, setState] = useState<CopyState>("idle")
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setState("copied")
    } catch {
      setState("error")
    }
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setState("idle"), 1800)
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={primary ? "default" : "outline"}
      onClick={copy}
      className={cn(
        "h-8 text-xs",
        primary && tone === "red" && "border-0 bg-red-700 text-white hover:bg-red-800",
        !primary && tone === "red" && "border-red-200 bg-white text-red-800 hover:bg-red-50",
        tone === "amber" && "border-amber-300 bg-white text-amber-900 hover:bg-amber-100",
      )}
    >
      {state === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="grid place-items-center">
        <span aria-hidden="true" className="invisible col-start-1 row-start-1">{children}</span>
        <span aria-hidden="true" className="invisible col-start-1 row-start-1"><Trans>Copy failed</Trans></span>
        <span className="col-start-1 row-start-1">
          {state === "copied" ? <Trans>Copied</Trans> : state === "error" ? <Trans>Copy failed</Trans> : children}
        </span>
      </span>
    </Button>
  )
}
