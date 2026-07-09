import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react"
import { Trans } from "@lingui/react/macro"
import {
  ArrowLeft,
  DoorOpen,
  Info,
  LogOut,
  TriangleAlert,
  Wand2,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

export type QuitIntent = "wizard" | "unsaved-changes"

interface CloseGuardContextValue {
  setIntent: (id: string, intent: QuitIntent | null) => void
}

const CloseGuardContext = createContext<CloseGuardContextValue | null>(null)

const ACCENTS = {
  amber: {
    band: "bg-amber-500/10",
    chip: "bg-amber-500/15 text-amber-600 ring-amber-500/25 dark:text-amber-400",
    eyebrow: "text-amber-600/90 dark:text-amber-400/90",
    callout: "border-amber-500/25 bg-amber-500/5",
    calloutIcon: "text-amber-600 dark:text-amber-400",
  },
  sky: {
    band: "bg-sky-500/10",
    chip: "bg-sky-500/15 text-sky-600 ring-sky-500/25 dark:text-sky-400",
    eyebrow: "text-sky-600/90 dark:text-sky-400/90",
    callout: "border-sky-500/25 bg-sky-500/5",
    calloutIcon: "text-sky-600 dark:text-sky-400",
  },
} as const

function QuitDialogShell({
  accent,
  HeaderIcon,
  CalloutIcon,
  eyebrow,
  title,
  body,
  callout,
  confirmLabel,
  onQuit,
}: {
  accent: keyof typeof ACCENTS
  HeaderIcon: ComponentType<{ className?: string }>
  CalloutIcon: ComponentType<{ className?: string }>
  eyebrow: ReactNode
  title: ReactNode
  body: ReactNode
  callout: ReactNode
  confirmLabel: ReactNode
  onQuit: () => void
}) {
  const a = ACCENTS[accent]
  return (
    <AlertDialogContent className="max-w-md gap-0 overflow-hidden p-0 [--tw-enter-translate-x:0]! [--tw-enter-translate-y:0]! [--tw-exit-translate-x:0]! [--tw-exit-translate-y:0]!">
      <div className={cn("flex items-center gap-3.5 px-6 py-5", a.band)}>
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-1",
            a.chip,
          )}
        >
          <HeaderIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-wide",
              a.eyebrow,
            )}
          >
            {eyebrow}
          </p>
          <AlertDialogTitle className="text-lg font-semibold leading-tight">
            {title}
          </AlertDialogTitle>
        </div>
      </div>

      <div className="space-y-4 px-6 py-5">
        <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
          {body}
        </AlertDialogDescription>
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-lg border px-3.5 py-3",
            a.callout,
          )}
        >
          <CalloutIcon className={cn("mt-0.5 h-4 w-4 shrink-0", a.calloutIcon)} />
          <span className="text-sm text-muted-foreground">{callout}</span>
        </div>
      </div>

      <AlertDialogFooter className="border-t bg-muted/20 px-6 py-4">
        <AlertDialogCancel className="mt-0 gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          <Trans>Stay</Trans>
        </AlertDialogCancel>
        <AlertDialogAction
          onClick={onQuit}
          className="gap-1.5 bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
        >
          <LogOut className="h-4 w-4" />
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}

/**
 * Renders the desktop quit-confirmation modal.
 *
 * The Electron main process gates every window-close path (title-bar button,
 * macOS traffic light, Cmd+Q, taskbar) and, when the renderer has a pending
 * `beforeunload`, asks us to confirm via `onCloseRequested`. Which dialog we
 * show depends on the active close intent registered via `useCloseIntent`:
 * the wizard (no save concept) vs. unsaved pipeline changes. No-op on web.
 */
export function CloseGuardProvider({ children }: { children: ReactNode }) {
  const controls =
    typeof window !== "undefined" ? window.api?.windowControls : undefined

  const intentsRef = useRef<Map<string, QuitIntent>>(new Map())
  const quittingRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [intent, setActiveIntent] = useState<QuitIntent>("unsaved-changes")

  const setIntent = useCallback((id: string, next: QuitIntent | null) => {
    if (next) intentsRef.current.set(id, next)
    else intentsRef.current.delete(id)
  }, [])

  useEffect(() => {
    if (!controls?.onCloseRequested) return
    return controls.onCloseRequested(() => {
      const active = new Set(intentsRef.current.values())
      if (active.size === 0) {
        controls.confirmClose()
        return
      }
      quittingRef.current = false
      setActiveIntent(active.has("unsaved-changes") ? "unsaved-changes" : "wizard")
      setOpen(true)
    })
  }, [controls])

  const quit = useCallback(() => {
    quittingRef.current = true
    setOpen(false)
    controls?.confirmClose()
  }, [controls])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !quittingRef.current) controls?.cancelClose()
      setOpen(next)
    },
    [controls],
  )

  return (
    <CloseGuardContext.Provider value={{ setIntent }}>
      {children}
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        {intent === "wizard" ? (
          <QuitDialogShell
            accent="sky"
            HeaderIcon={Wand2}
            CalloutIcon={Info}
            onQuit={quit}
            eyebrow={<Trans>Book setup</Trans>}
            title={<Trans>Leave without finishing?</Trans>}
            body={
              <Trans>
                You're partway through setting up a book. There's nothing to save
                yet — leaving now discards your progress and you'll start over.
              </Trans>
            }
            callout={
              <Trans>
                The file you uploaded and the options you picked won't be kept.
              </Trans>
            }
            confirmLabel={<Trans>Leave setup</Trans>}
          />
        ) : (
          <QuitDialogShell
            accent="amber"
            HeaderIcon={DoorOpen}
            CalloutIcon={TriangleAlert}
            onQuit={quit}
            eyebrow={<Trans>Unsaved changes</Trans>}
            title={<Trans>Quit without saving?</Trans>}
            body={
              <Trans>
                You have changes that haven't been saved yet. If you quit now,
                they'll be lost.
              </Trans>
            }
            callout={
              <Trans>Save your work first if you want to keep these changes.</Trans>
            }
            confirmLabel={<Trans>Quit anyway</Trans>}
          />
        )}
      </AlertDialog>
    </CloseGuardContext.Provider>
  )
}

/**
 * Declare the reason the app should confirm before quitting, so the desktop
 * quit dialog can show the right message. While `active` is true this intent is
 * registered; higher-specificity intents win when several are active. No-op on
 * the web build (the browser shows its native beforeunload prompt instead).
 */
export function useCloseIntent(active: boolean, intent: QuitIntent): void {
  const ctx = useContext(CloseGuardContext)
  const id = useId()
  useEffect(() => {
    if (!ctx) return
    ctx.setIntent(id, active ? intent : null)
    return () => ctx.setIntent(id, null)
  }, [ctx, id, active, intent])
}
