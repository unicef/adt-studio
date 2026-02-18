import { useState, useEffect, useRef, useCallback } from "react"
import { Loader2 } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { api, getAdtUrl } from "@/api/client"

export function PreviewView({ bookLabel }: { bookLabel: string }) {
  const queryClient = useQueryClient()
  const [packaging, setPackaging] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [version, setVersion] = useState(0)
  const ranRef = useRef(false)

  const runPackage = useCallback(async () => {
    setPackaging(true)
    setError(null)
    setReady(false)
    try {
      await api.packageAdt(bookLabel)
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "step-status"] })
      setVersion((v) => v + 1)
      setReady(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Packaging failed")
    } finally {
      setPackaging(false)
    }
  }, [bookLabel, queryClient])

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    runPackage()
  }, [bookLabel])

  // Listen for re-package requests from the sidebar refresh button
  useEffect(() => {
    const handler = () => { runPackage() }
    window.addEventListener("adt:repackage", handler)
    return () => window.removeEventListener("adt:repackage", handler)
  }, [runPackage])

  if (packaging) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">Packaging preview...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 max-w-xl">
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-xs text-red-700 whitespace-pre-wrap break-words">{error}</p>
        </div>
      </div>
    )
  }

  if (ready) {
    return (
      <iframe
        src={`${getAdtUrl(bookLabel)}/v-${Date.now()}/`}
        className="w-full h-full border-0"
        title="ADT Preview"
      />
    )
  }

  return null
}
