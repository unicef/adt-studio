import { useCallback, useRef } from "react"
import { useBlocker, type ShouldBlockFn } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useHasUnsavedChanges } from "./floating-save"

/**
 * Warns before leaving a view that has unsaved changes — both on in-app
 * navigation (stage/page/book switches, which otherwise silently drop pending
 * edits) and on tab close/reload. Reads the shared floating-save registry, so
 * it must be rendered inside a FloatingSaveProvider and under the router.
 */
export function UnsavedChangesGuard() {
  const hasUnsaved = useHasUnsavedChanges()
  // Read the live value through a ref so the blocker callbacks can stay stable
  // (registered once) yet never see a stale value.
  const hasUnsavedRef = useRef(hasUnsaved)
  hasUnsavedRef.current = hasUnsaved

  // Only block when actually leaving the view (pathname change). Same-path
  // navigations — e.g. switching settings tabs via search params, where the
  // page stays mounted and edits persist — shouldn't prompt.
  const shouldBlockFn = useCallback<ShouldBlockFn>(
    ({ current, next }) =>
      hasUnsavedRef.current && current.pathname !== next.pathname,
    [],
  )
  const enableBeforeUnload = useCallback(() => hasUnsavedRef.current, [])

  const { status, proceed, reset } = useBlocker({
    shouldBlockFn,
    enableBeforeUnload,
    withResolver: true,
  })

  return (
    <AlertDialog
      open={status === "blocked"}
      onOpenChange={(open) => {
        // Escape / dismiss keeps the user on the page.
        if (!open) reset?.()
      }}
    >
      <AlertDialogContent className="[--tw-enter-translate-x:0]! [--tw-enter-translate-y:0]! [--tw-exit-translate-x:0]! [--tw-exit-translate-y:0]!">
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Discard unsaved changes?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>You have unsaved changes. If you leave, they'll be lost.</Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* Cancel routes through onOpenChange -> reset (also handles Escape). */}
          <AlertDialogCancel>
            <Trans>Stay</Trans>
          </AlertDialogCancel>
          <Button variant="destructive" onClick={() => proceed?.()}>
            <Trans>Leave</Trans>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
