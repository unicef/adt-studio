import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { Check, type LucideIcon } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import type { VersionEntry } from "@/api/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

/** Selected-version state for a compare dialog: preselects `initialSelected`
 *  each time the dialog opens. Callers own it so they can memoize off it. */
export function useSelectedVersion(open: boolean, initialSelected: number) {
  const [selected, setSelected] = useState(initialSelected)
  const wasOpen = useRef(false)
  useEffect(() => {
    // Preselect only when the dialog *opens*, not on every `initialSelected`
    // change — otherwise a parent re-render (e.g. currentVersion updating) would
    // snap the user's chosen chip back to the default while the dialog is open.
    if (open && !wasOpen.current) setSelected(initialSelected)
    wasOpen.current = open
  }, [open, initialSelected])
  return [selected, setSelected] as const
}

export interface VersionCompareShellProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  versions: VersionEntry[]
  currentVersion: number
  /** Selected version (controlled) and its setter. */
  selected: number
  onSelect: (version: number) => void
  accentColor: string
  icon: LucideIcon
  /** Header description line (mode-specific). */
  description: string
  /** DialogContent sizing/layout classes (each mode picks its own width). */
  contentClassName: string
  /** Restore the given version (moves the pointer); resolves when done. */
  onRestore: (version: number) => Promise<void> | void
  /** Optional control shown to the right of the version chips (e.g. a filter). */
  controls?: ReactNode
  /** Optional footer-left content (e.g. a change legend). */
  footerLeft?: ReactNode
  /** The comparison body for the selected version. */
  children: ReactNode
}

/**
 * Shared frame for the version-compare dialogs: dialog shell + stage-accent
 * header, the version-chip selector, and the Cancel / "Use version N" footer.
 * Callers provide only the comparison body (rendered previews or an item diff)
 * plus optional chip-row controls and a footer legend. Owns the `selected`
 * state so both dialog styles behave identically.
 */
export function VersionCompareShell({
  open,
  onOpenChange,
  versions,
  currentVersion,
  selected,
  onSelect,
  accentColor,
  icon: Icon,
  description,
  contentClassName,
  onRestore,
  controls,
  footerLeft,
  children,
}: VersionCompareShellProps) {
  const { t } = useLingui()
  const isCurrent = selected === currentVersion

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={contentClassName}
        style={{ "--accent-color": accentColor, "--ring": accentColor } as CSSProperties}
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" strokeWidth={2.25} style={{ color: accentColor }} aria-hidden />
            <DialogTitle>{t`Compare versions`}</DialogTitle>
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
          <div className="flex flex-wrap items-center gap-1">
            {versions.map((v) => {
              const chipCurrent = v.version === currentVersion
              const chipSelected = v.version === selected
              return (
                <button
                  key={v.version}
                  type="button"
                  onClick={() => onSelect(v.version)}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    chipSelected ? "text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                  style={chipSelected ? { backgroundColor: accentColor } : undefined}
                >
                  v{v.version}
                  {chipCurrent && (
                    <span
                      className="rounded px-1 py-0.5 text-[9px]"
                      style={chipSelected ? undefined : { backgroundColor: `${accentColor}1a`, color: accentColor }}
                    >
                      {t`current`}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {controls}
        </div>

        {children}

        <div className="flex shrink-0 items-center justify-between gap-3 border-t p-2.5 sm:p-3">
          <div className="flex items-center gap-3">{footerLeft}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted cursor-pointer"
            >
              {t`Cancel`}
            </button>
            <button
              type="button"
              disabled={isCurrent}
              onClick={() => {
                // Close first, then restore in the background: the picker shows
                // its own pending spinner and the dialog exits cleanly instead
                // of being torn down mid-restore.
                onOpenChange(false)
                void onRestore(selected)
              }}
              style={{ backgroundColor: accentColor }}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Check className="h-4 w-4" />
              {t`Use version ${selected}`}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
