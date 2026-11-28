import { useEffect, useRef, useState, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { FileUp, LogOut } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useCloseIntent } from "@/components/close-guard/CloseGuard"

type Kind = "change" | "leave"

/**
 * Asks before the setup so far is lost: changing the PDF (the picker or a dropped file) or leaving
 * Add Book (the top bar's back). Closing the window or reloading asks too, as in the wizard. Only
 * while there's something to lose: a PDF is chosen and its book isn't set up yet.
 * `confirm(kind, go)` runs `go` at once when there's nothing to lose, else after the user agrees.
 */
export function useLeaveGuard(active: boolean): { confirm: (kind: Kind, go: () => void) => void; dialog: ReactNode } {
  const [asking, setAsking] = useState<Kind | null>(null)
  const next = useRef<(() => void) | null>(null)

  useCloseIntent(active, "wizard")
  useEffect(() => {
    if (!active) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [active])

  const confirm = (kind: Kind, go: () => void) => {
    if (!active) return go()
    next.current = go
    setAsking(kind)
  }
  const change = asking === "change"
  const dialog = (
    <AlertDialog open={asking !== null} onOpenChange={(o) => !o && setAsking(null)}>
      <AlertDialogContent className="max-w-[440px] rounded-[20px]">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">{change ? <FileUp className="size-5" /> : <LogOut className="size-5" />}</span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <AlertDialogTitle className="text-[17px]">{change ? <Trans>Change the PDF?</Trans> : <Trans>Leave Add Book?</Trans>}</AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] leading-relaxed">
              {change ? (
                <Trans>The choices you made for this book will be lost, and the new PDF is read again from the start.</Trans>
              ) : (
                <Trans>The PDF and the choices you made for this book will be lost. Nothing has been converted yet.</Trans>
              )}
            </AlertDialogDescription>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{change ? <Trans>Keep this PDF</Trans> : <Trans>Stay</Trans>}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const go = next.current
              next.current = null
              setAsking(null)
              go?.()
            }}
          >
            {change ? <Trans>Choose another PDF</Trans> : <Trans>Leave</Trans>}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return { confirm, dialog }
}
