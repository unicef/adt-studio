import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"

import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

type CopyState = "idle" | "copied" | "error"

const ICON_SWAP = "absolute inset-0 size-3.5 transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"

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

  const copied = state === "copied"

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={copy}
      className="h-8 border-brand-300/60 text-xs text-brand-600 hover:bg-brand-500/10 hover:text-brand-700 dark:border-brand-700/60 dark:text-brand-400 dark:hover:text-brand-300"
    >
      <span aria-hidden="true" className="relative size-3.5 shrink-0">
        <Copy className={cn(ICON_SWAP, copied ? "scale-25 opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-none")} />
        <Check className={cn(ICON_SWAP, copied ? "scale-100 opacity-100 blur-none" : "scale-25 opacity-0 blur-[4px]")} />
      </span>
      <span className="grid place-items-center">
        <span aria-hidden="true" className="invisible col-start-1 row-start-1">{children}</span>
        <span aria-hidden="true" className="invisible col-start-1 row-start-1"><Trans>Copy failed</Trans></span>
        <span className="col-start-1 row-start-1">
          {copied ? <Trans>Copied</Trans> : state === "error" ? <Trans>Copy failed</Trans> : children}
        </span>
      </span>
    </Button>
  )
}
