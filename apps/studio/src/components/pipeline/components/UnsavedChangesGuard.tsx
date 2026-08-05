import { Fragment, useCallback, useRef, useState } from "react"
import { useBlocker, type ShouldBlockFn } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { Loader2, Play, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import {
  useHasUnsavedChanges,
  useFloatingSaveLeaveAction,
  useFloatingSaveDirtyEntries,
} from "./floating-save"
import {
  useHasAnyDirtyTab,
  useDirtyTabEntries,
  useEphemeralDirtyTabs,
} from "@/hooks/use-settings-dirty-tabs"
import { getSettingsTabLabel } from "../settings-tabs"
import { STAGES } from "../stage-config"
import { getStageLabelI18n } from "../pipeline-i18n"
import { useCloseIntent } from "@/components/close-guard/CloseGuard"

const STAGE_BY_SLUG = new Map<string, (typeof STAGES)[number]>(STAGES.map((s) => [s.slug, s]))

export function UnsavedChangesGuard() {
  const { t, i18n } = useLingui()
  const hasFloatingUnsaved = useHasUnsavedChanges()
  const hasDirtyTab = useHasAnyDirtyTab()
  const hasUnsaved = hasFloatingUnsaved || hasDirtyTab

  useCloseIntent(hasUnsaved, "unsaved-changes")
  const dirtyEntries = useDirtyTabEntries()
  const floatingDirtyEntries = useFloatingSaveDirtyEntries()
  const ephemeralDirtyTabs = useEphemeralDirtyTabs()
  const { canSave, willRerun, resetStages, saveAndStay } = useFloatingSaveLeaveAction()
  const [saving, setSaving] = useState(false)

  const hasUnsavedRef = useRef(hasUnsaved)
  hasUnsavedRef.current = hasUnsaved
  const ephemeralDirtyRef = useRef(ephemeralDirtyTabs)
  ephemeralDirtyRef.current = ephemeralDirtyTabs

  const shouldBlockFn = useCallback<ShouldBlockFn>(({ current, next }) => {
    if (!hasUnsavedRef.current) return false
    if (current.pathname !== next.pathname) return true
    const nextTab = (next.search as { tab?: string } | undefined)?.tab
    const currentTab = (current.search as { tab?: string } | undefined)?.tab
    if (nextTab === "overview" && currentTab !== "overview") return true
    for (const tab of ephemeralDirtyRef.current) {
      if (tab !== nextTab) return true
    }
    return false
  }, [])
  const enableBeforeUnload = useCallback(() => hasUnsavedRef.current, [])

  const { status, proceed, reset } = useBlocker({
    shouldBlockFn,
    enableBeforeUnload,
    withResolver: true,
  })

  const isSettings = dirtyEntries.length > 0
  const primaryStage = dirtyEntries[0]?.stage ?? floatingDirtyEntries.find((e) => e.stage)?.stage

  const liveChangeChips = dirtyEntries.flatMap((entry) => {
    const def = STAGE_BY_SLUG.get(entry.stage)
    return entry.tabs.map((tabKey) => ({
      key: `${entry.stage}:${tabKey}`,
      label: getSettingsTabLabel(entry.stage, tabKey, i18n),
      dotColor: def?.color ?? "bg-amber-500",
    }))
  })

  const liveEditorLabels = isSettings
    ? []
    : floatingDirtyEntries.filter((e) => e.label != null)

  // The dialog outlives its dirty entries: each surface clears its entry as soon
  // as it persists, but the navigation only resumes once every save resolves. So
  // while the dialog is up we keep rendering the last populated snapshot —
  // otherwise it visibly degrades mid-save into a generic, button-less
  // "Heads up" with no pending-edit chips.
  const liveSnapshot = {
    isSettings,
    primaryStage,
    changeChips: liveChangeChips,
    editorLabels: liveEditorLabels,
    canSave,
    willRerun,
    resetStages,
  }
  const snapshot = useRef(liveSnapshot)
  const snapshotLocked = useRef(false)
  if (status !== "blocked") {
    snapshot.current = liveSnapshot
    snapshotLocked.current = false
  } else if (!snapshotLocked.current && hasUnsaved) {
    // Capture once when navigation first blocks. Multi-entry saves settle at
    // different times, so continuing to refresh while blocked would change the
    // stage attribution, pending chips, and Save & Re-run wording mid-save.
    snapshot.current = liveSnapshot
    snapshotLocked.current = true
  }
  const shown = snapshot.current

  const stageDef = shown.primaryStage ? STAGE_BY_SLUG.get(shown.primaryStage) : undefined
  const HeaderIcon = stageDef?.icon ?? TriangleAlert
  const headerColor = stageDef?.color ?? "bg-gray-700"
  const {
    isSettings: showSettings,
    changeChips,
    editorLabels,
    canSave: showCanSave,
    willRerun: showWillRerun,
    resetStages: showResetStages,
  } = shown
  const resetStageDefs = showResetStages
    .map((stage) => STAGE_BY_SLUG.get(stage))
    .filter((stage): stage is (typeof STAGES)[number] => Boolean(stage))

  const handleSaveAndContinue = async () => {
    setSaving(true)
    const saved = await saveAndStay().then(() => true).catch(() => false)
    setSaving(false)
    if (saved) proceed?.()
  }

  return (
    <AlertDialog
      open={status === "blocked"}
      onOpenChange={(open) => {
        if (!open && !saving) reset?.()
      }}
    >
      <AlertDialogContent className="max-w-lg gap-0 overflow-hidden p-0 [--tw-enter-translate-x:0]! [--tw-enter-translate-y:0]! [--tw-exit-translate-x:0]! [--tw-exit-translate-y:0]!">
        <div className={cn("flex items-center gap-3 px-6 py-4 text-white", headerColor)}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
            <HeaderIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-white/75">
              {stageDef
                ? showSettings
                  ? `${getStageLabelI18n(stageDef.slug)} · ${t`Settings`}`
                  : getStageLabelI18n(stageDef.slug)
                : t`Heads up`}
            </p>
            <AlertDialogTitle className="text-lg font-semibold leading-tight text-white">
              <Trans>Unsaved changes</Trans>
            </AlertDialogTitle>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {showWillRerun ? (
              <Trans>
                These edits haven't been applied yet. Leave and they'll be lost — or save and
                re-run to apply them. The run continues in the background while you keep working.
              </Trans>
            ) : (
              <Trans>If you leave now, your unsaved changes will be lost.</Trans>
            )}
          </AlertDialogDescription>

          {(changeChips.length > 0 || editorLabels.length > 0) && (
            <div className="rounded-lg border bg-muted/30 px-3.5 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Trans>Pending edits</Trans>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {changeChips.length > 0
                  ? changeChips.map((chip) => (
                      <span
                        key={chip.key}
                        className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium text-foreground"
                      >
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", chip.dotColor)} aria-hidden />
                        {chip.label}
                      </span>
                    ))
                  : editorLabels.map((entry) => (
                      <Fragment key={entry.id}>{entry.label}</Fragment>
                    ))}
              </div>
            </div>
          )}

          {resetStageDefs.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-3">
              <p className="text-xs leading-relaxed text-amber-900">
                <Trans>
                  The completed stages below will be reset and need to run again before final
                  outputs are available.
                </Trans>
              </p>
              <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                <Trans>Will be reset</Trans>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {resetStageDefs.map((stage) => {
                  const Icon = stage.icon
                  return (
                    <span
                      key={stage.slug}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium text-foreground"
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded text-white",
                          stage.color,
                        )}
                      >
                        <Icon className="h-2.5 w-2.5" aria-hidden />
                      </span>
                      {getStageLabelI18n(stage.slug)}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-6 py-4">
          <Button
            variant="ghost"
            disabled={saving}
            onClick={() => proceed?.()}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trans>Discard &amp; leave</Trans>
          </Button>
          <div className="flex items-center gap-2">
            <AlertDialogCancel disabled={saving} className="mt-0">
              <Trans>Stay</Trans>
            </AlertDialogCancel>
            {showCanSave && (
              <Button
                onClick={handleSaveAndContinue}
                disabled={saving}
                className={cn("min-w-[7.5rem] text-white hover:opacity-90", headerColor)}
              >
                {saving ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : showWillRerun ? (
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                ) : null}
                {showWillRerun ? t`Save & Re-run` : t`Save & leave`}
              </Button>
            )}
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
