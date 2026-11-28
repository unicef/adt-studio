import { useCallback, useRef, useState, type ReactNode } from "react"
import { useBlocker } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { FileUp, LogOut } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useCloseIntent } from "@/components/close-guard/CloseGuard"
import { useReturnFocus } from "./useReturnFocus"

type Kind = "change" | "leave"

/**
 * Asks before the setup so far is lost: changing the PDF (the picker or a dropped file) or leaving
 * Add Book (the top bar's back, the browser's back, any other link). Closing the window or
 * reloading asks too, as in the wizard. Only while there's something to lose: a PDF is chosen and
 * its book isn't set up yet.
 * `confirm(kind, go)` runs `go` at once when there's nothing to lose, else after the user agrees;
 * leaving is asked by the router's blocker, so `confirm("leave", go)` just navigates.
 */
export function useLeaveGuard(active: boolean): { confirm: (kind: Kind, go: () => void) => void; dialog: ReactNode } {
  const [changing, setChanging] = useState(false)
  const next = useRef<(() => void) | null>(null)

  useCloseIntent(active, "wizard")
  const activeRef = useRef(active)
  activeRef.current = active
  const shouldBlock = useCallback(() => activeRef.current, [])
  const leaving = useBlocker({ shouldBlockFn: shouldBlock, enableBeforeUnload: shouldBlock, withResolver: true })

  const confirm = (kind: Kind, go: () => void) => {
    if (!active || kind === "leave") return go()
    next.current = go
    setChanging(true)
  }
  const asking: Kind | null = leaving.status === "blocked" ? "leave" : changing ? "change" : null
  const change = asking === "change"
  // Back to the button that asked (the top bar's back, the PDF picker), not the page body.
  const returnFocus = useReturnFocus(asking !== null)
  // Stay, Escape or a click outside: the navigation is cancelled (after Leave it has already gone ahead).
  const close = () => {
    if (leaving.status === "blocked") leaving.reset()
    setChanging(false)
  }
  const agree = () => {
    if (leaving.status === "blocked") return leaving.proceed()
    const go = next.current
    next.current = null
    setChanging(false)
    go?.()
  }
  const dialog = (
    <AlertDialog open={asking !== null} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent onCloseAutoFocus={returnFocus} className="max-w-[440px] rounded-[20px]">
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
          <AlertDialogAction onClick={agree}>{change ? <Trans>Choose another PDF</Trans> : <Trans>Leave</Trans>}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return { confirm, dialog }
}
