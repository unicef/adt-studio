import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { UpdateDialog } from "./UpdateDialog"
import { PostUpdateDialog } from "./PostUpdateDialog"
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

export function UpdateDialogProvider({ children }: { children: ReactNode }) {
  const { status, check } = useUpdateStatus()
  const currentVersion = useAppVersion()
  const [open, setOpen] = useState(false)
  const autoOpenedFor = useRef<string | null>(null)

  const [postUpdate, setPostUpdate] = useState<ElectronPostUpdateInfo | null>(
    null,
  )
  const [currentRelease, setCurrentRelease] =
    useState<ElectronAvailableRelease | null>(null)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)

  const phase = status.phase
  const hasPendingUpdate =
    phase === "available" || phase === "downloading" || phase === "downloaded"

  useEffect(() => {
    if (status.phase !== "available") return
    if (autoOpenedFor.current === status.version) return
    autoOpenedFor.current = status.version
    setOpen(true)
  }, [status])

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

  const whatsNewVersion = postUpdate?.version ?? currentVersion ?? ""
  const whatsNewNotes = postUpdate?.releaseNotes ?? currentRelease?.releaseNotes
  const showPostUpdate = Boolean(postUpdate) || whatsNewOpen

  return (
    <UpdateDialogContext value={value}>
      {children}
      <UpdateDialog
        open={open}
        onOpenChange={setOpen}
        onShowWhatsNew={showWhatsNew}
      />
      {showPostUpdate && (
        <PostUpdateDialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setPostUpdate(null)
              setWhatsNewOpen(false)
            }
          }}
          version={whatsNewVersion}
          releaseNotes={whatsNewNotes}
        />
      )}
    </UpdateDialogContext>
  )
}
