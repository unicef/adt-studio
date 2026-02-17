import { useState, useEffect, useRef } from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { api, getAdtUrl } from "@/api/client"

export function PreviewView({ bookLabel }: { bookLabel: string }) {
  const queryClient = useQueryClient()
  const [packaging, setPackaging] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [version, setVersion] = useState(0)
  const ranRef = useRef(false)

  const runPackage = async () => {
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
  }

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    runPackage()
  }, [bookLabel])

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
      <div className="flex flex-col h-full">
        <div className="shrink-0 px-4 py-2 flex items-center gap-2 border-b bg-muted/30">
          <button
            type="button"
            onClick={runPackage}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Re-package ADT"
          >
            <RotateCcw className="w-3 h-3" />
            Re-package
          </button>
        </div>
        <iframe
          src={`${getAdtUrl(bookLabel)}?v=${version}`}
          className="flex-1 w-full border-0"
          title="ADT Preview"
        />
      </div>
    )
  }

  return null
}
