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
import { useUpdateStatus } from "@/hooks/use-update-status"
import { isElectron } from "@/lib/utils"

interface UpdateDialogContextValue {
  openUpdateDialog: () => void
  hasPendingUpdate: boolean
}

const UpdateDialogContext = createContext<UpdateDialogContextValue>({
  openUpdateDialog: () => {},
  hasPendingUpdate: false,
})

export function useUpdateDialog(): UpdateDialogContextValue {
  return useContext(UpdateDialogContext)
}

export function UpdateDialogProvider({ children }: { children: ReactNode }) {
  const { status, check } = useUpdateStatus()
  const [open, setOpen] = useState(false)
  const autoOpenedFor = useRef<string | null>(null)

  const [postUpdate, setPostUpdate] = useState<ElectronPostUpdateInfo | null>(
    null,
  )

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

  const value = useMemo(
    () => ({ openUpdateDialog, hasPendingUpdate }),
    [openUpdateDialog, hasPendingUpdate],
  )

  return (
    <UpdateDialogContext value={value}>
      {children}
      <UpdateDialog open={open} onOpenChange={setOpen} />
      {postUpdate && (
        <PostUpdateDialog
          open
          onOpenChange={(next) => {
            if (!next) setPostUpdate(null)
          }}
          version={postUpdate.version}
          releaseNotes={postUpdate.releaseNotes}
        />
      )}
    </UpdateDialogContext>
  )
}
