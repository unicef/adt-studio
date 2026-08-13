import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"

import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"

type CopyState = "idle" | "copied" | "error"

export function CopyTextButton({
  value,
  children,
}: {
  value: string
  children: ReactNode
}) {
  const { t } = useLingui()
  const [state, setState] = useState<CopyState>("idle")
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setState("copied")
      toast.success(t`Copied`)
    } catch {
      setState("error")
      toast.error(t`Copy failed`)
    }
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setState("idle"), 1800)
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={copy}
      className="h-8 border-primary/30 bg-white text-xs text-primary hover:bg-primary/5"
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
