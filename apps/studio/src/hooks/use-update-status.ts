import { useCallback, useEffect, useState } from "react"
import { isElectron } from "@/lib/utils"

export type UpdateStatus = ElectronUpdateStatus

interface UseUpdateStatus {
  status: UpdateStatus
  check: () => Promise<void>
  download: () => Promise<void>
  cancel: () => Promise<void>
  install: () => Promise<void>
  installOnQuit: () => Promise<void>
}

export function useUpdateStatus(): UseUpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ phase: "idle" })

  useEffect(() => {
    if (!isElectron()) return
    const updates = window.api?.updates
    if (!updates) return

    let cancelled = false
    updates.getStatus().then((initial) => {
      if (!cancelled) setStatus(initial)
    })

    return updates.onStatus((next) => {
      if (!cancelled) setStatus(next)
    })
  }, [])

  const check = useCallback(async () => {
    if (!isElectron() || !window.api?.updates) return
    const result = await window.api.updates.check()
    setStatus(result)
  }, [])

  const download = useCallback(async () => {
    if (!isElectron() || !window.api?.updates) return
    await window.api.updates.download()
  }, [])

  const cancel = useCallback(async () => {
    if (!isElectron() || !window.api?.updates) return
    const result = await window.api.updates.cancel()
    setStatus(result)
  }, [])

  const install = useCallback(async () => {
    if (!isElectron() || !window.api?.updates) return
    await window.api.updates.install()
  }, [])

  const installOnQuit = useCallback(async () => {
    if (!isElectron() || !window.api?.updates) return
    await window.api.updates.installOnQuit()
  }, [])

  return { status, check, download, cancel, install, installOnQuit }
}
