import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useRouterState } from "@tanstack/react-router"
import { UpdateDialog } from "./UpdateDialog"
import { PostUpdateDialog } from "./PostUpdateDialog"
import { UpdateToast } from "./UpdateToast"
import { useAppVersion } from "@/hooks/use-app-version"
import { useUpdateStatus } from "@/hooks/use-update-status"
import { isElectron } from "@/lib/utils"

interface UpdateDialogContextValue {
  openUpdateDialog: () => void
  showWhatsNew: () => void
  hasPendingUpdate: boolean
}

const UpdateDialogContext = createContext<UpdateDialogContextValue>({
  openUpdateDialog: () => {},
  showWhatsNew: () => {},
  hasPendingUpdate: false,
})

export function useUpdateDialog(): UpdateDialogContextValue {
  return useContext(UpdateDialogContext)
}

/**
 * Pipeline routes are `/books/<label>/…`. `/books/new` and `/books/import` are
 * the wizard and importer, which sit outside the pipeline shell.
 */
export function isPipelineRoute(pathname: string): boolean {
  const match = /^\/books\/([^/]+)/.exec(pathname)
  if (!match) return false
  return match[1] !== "new" && match[1] !== "import"
}

export function UpdateDialogProvider({ children }: { children: ReactNode }) {
  const { status, check, download, cancel, install } = useUpdateStatus()
  const currentVersion = useAppVersion()
  const [open, setOpen] = useState(false)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)

  const [postUpdate, setPostUpdate] = useState<ElectronPostUpdateInfo | null>(
    null,
  )
  const [currentRelease, setCurrentRelease] =
    useState<ElectronAvailableRelease | null>(null)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const [detailsOverride, setDetailsOverride] =
    useState<ElectronPostUpdateInfo | null>(null)

  const phase = status.phase
  const hasPendingUpdate =
    phase === "available" || phase === "downloading" || phase === "downloaded"

  const cardDetails =
    status.phase === "available" || status.phase === "downloaded"
      ? { version: status.version, releaseNotes: status.releaseNotes }
      : null
  const pendingVersion =
    status.phase === "available" ||
    status.phase === "downloading" ||
    status.phase === "downloaded"
      ? status.version
      : null
  // The card is the ambient surface; never stack it with an open dialog or the
  // post-install "What's new" celebration.
  const anyDialogOpen =
    open || Boolean(postUpdate) || whatsNewOpen || Boolean(detailsOverride)
  // Two places the ambient card stays out of: onboarding, a full-screen
  // first-run flow that on the desktop runs in its own small window; and the
  // pipeline, whose bottom-right corner already holds the debug console and the
  // preview cards, and which is deep-focus work either way.
  const hideAmbientCard = useRouterState({
    select: (state) =>
      state.location.pathname.startsWith("/onboarding") ||
      isPipelineRoute(state.location.pathname),
  })
  const showToast =
    hasPendingUpdate &&
    !anyDialogOpen &&
    !hideAmbientCard &&
    dismissedVersion !== pendingVersion

  useEffect(() => {
    if (!isElectron() || !window.api?.updates?.getPostUpdate) return
    let cancelled = false
    window.api.updates.getPostUpdate().then((info) => {
      if (!cancelled && info) setPostUpdate(info)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const openUpdateDialog = useCallback(() => {
    setOpen(true)
    if (phase === "idle" || phase === "not-available" || phase === "error") {
      check()
    }
  }, [phase, check])

  const showWhatsNew = useCallback(() => {
    setOpen(false)
    setWhatsNewOpen(true)
    if (currentRelease || !isElectron() || !window.api?.updates?.listVersions)
      return
    window.api.updates
      .listVersions()
      .then((releases) => {
        const current =
          releases.find((r) => r.direction === "current") ??
          releases.find((r) => r.version === currentVersion) ??
          null
        if (current) setCurrentRelease(current)
      })
      .catch(() => {})
  }, [currentRelease, currentVersion])

  const value = useMemo(
    () => ({ openUpdateDialog, showWhatsNew, hasPendingUpdate }),
    [openUpdateDialog, showWhatsNew, hasPendingUpdate],
  )

  const whatsNewVersion =
    detailsOverride?.version ?? postUpdate?.version ?? currentVersion ?? ""
  // When "See release notes" targets a specific release, show that release's
  // notes as a unit — never fall through to a different release's notes.
  const whatsNewNotes = detailsOverride
    ? detailsOverride.releaseNotes
    : (postUpdate?.releaseNotes ?? currentRelease?.releaseNotes)
  const showPostUpdate =
    Boolean(postUpdate) || whatsNewOpen || Boolean(detailsOverride)

  return (
    <UpdateDialogContext value={value}>
      {children}
      <UpdateDialog
        open={open}
        onOpenChange={setOpen}
        onShowWhatsNew={showWhatsNew}
        onSeeDetails={(payload) => {
          setDetailsOverride(payload)
          setOpen(false)
        }}
      />
      {showPostUpdate && (
        <PostUpdateDialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setPostUpdate(null)
              setWhatsNewOpen(false)
              setDetailsOverride(null)
            }
          }}
          version={whatsNewVersion}
          releaseNotes={whatsNewNotes}
        />
      )}
      {showToast && (
        <UpdateToast
          status={status}
          onDetails={
            cardDetails ? () => setDetailsOverride(cardDetails) : undefined
          }
          onDownload={download}
          onInstallNow={install}
          onCancel={cancel}
          onDismiss={() => setDismissedVersion(pendingVersion)}
        />
      )}
    </UpdateDialogContext>
  )
}
