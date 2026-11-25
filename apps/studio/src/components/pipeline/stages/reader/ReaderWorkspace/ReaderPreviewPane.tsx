import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useQuery } from "@tanstack/react-query"
import { RefreshCw, TriangleAlert } from "lucide-react"
import { api, BASE_URL } from "@/api/client"
import { Button } from "@/components/ui/button"
import type { ReaderWorkspaceState } from "./use-reader-workspace"

const RELOAD_STYLES_MESSAGE = "adt-studio/reload-styles"
const RUNTIME_ERROR_MESSAGE = "adt-runtime/error"
const COMPILE_DELAY_MS = 1200

interface RuntimeCrash {
  message: string
  path: string | null
  line: number | null
  component: string | null
}

export function onlyStylesChanged(previous: Record<string, string> | null, next: Record<string, string>): boolean {
  if (!previous) return false
  const paths = new Set([...Object.keys(previous), ...Object.keys(next)])
  const changed = [...paths].filter((path) => previous[path] !== next[path])
  return changed.length > 0 && changed.every((path) => path.endsWith(".css"))
}

export function ReaderPreviewPane({ workspace, label }: { workspace: ReaderWorkspaceState; label: string }) {
  const { t } = useLingui()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const lastCompiled = useRef<{ drafts: Record<string, string>; savedAt: number } | null>(null)
  const [compiling, setCompiling] = useState(false)
  const [crash, setCrash] = useState<RuntimeCrash | null>(null)
  const previewBase = `${BASE_URL}/books/${label}/adt-preview`
  const { buffers, tree, setCompileErrors, compileErrors } = workspace
  const savedAt = tree.dataUpdatedAt

  const pages = useQuery({
    queryKey: ["books", label, "reader-source", "preview-pages"],
    queryFn: async () => {
      const response = await fetch(`${previewBase}/content/pages.json`)
      return (await response.json()) as Array<{ href: string }>
    },
  })
  const firstPage = pages.data?.[0]?.href

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setCompiling(true)
      try {
        const result = await api.compileReaderSource(label, buffers)
        setCompileErrors(result.errors)
        if (!result.ok) return
        const previous = lastCompiled.current
        lastCompiled.current = { drafts: buffers, savedAt }
        if (!previous) return
        setCrash(null)
        const frame = iframeRef.current?.contentWindow
        if (previous.savedAt === savedAt && onlyStylesChanged(previous.drafts, buffers)) {
          frame?.postMessage({ type: RELOAD_STYLES_MESSAGE }, "*")
        } else {
          frame?.location.reload()
        }
      } catch (err) {
        setCompileErrors([{ path: "", line: 0, column: 0, message: err instanceof Error ? err.message : String(err) }])
      } finally {
        setCompiling(false)
      }
    }, COMPILE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [buffers, label, savedAt, setCompileErrors])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      const data = event.data as ({ type?: unknown } & Partial<RuntimeCrash>) | null
      if (data?.type !== RUNTIME_ERROR_MESSAGE) return
      setCrash({ message: String(data.message ?? ""), path: data.path ?? null, line: data.line ?? null, component: data.component ?? null })
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/30">
      <div className="flex shrink-0 items-center gap-2 border-b bg-background px-2 py-1 text-xs">
        <span className="font-medium"><Trans>Preview</Trans></span>
        {compiling && <span className="text-muted-foreground"><Trans>Compiling...</Trans></span>}
        <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={() => iframeRef.current?.contentWindow?.location.reload()} title={t`Reload the preview`}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {compileErrors.length > 0 && (
        <div role="alert" className="max-h-40 shrink-0 overflow-y-auto border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <p className="mb-1 font-medium"><Trans>The reader does not compile. The preview shows the last version that did.</Trans></p>
          <ul className="space-y-0.5">
            {compileErrors.map((error, index) => (
              <li key={index}>
                {error.path ? (
                  <button type="button" className="font-mono underline" onClick={() => workspace.open(error.path, error.line)}>
                    {error.path}:{error.line}:{error.column}
                  </button>
                ) : null}{" "}
                {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {crash && (
        <div role="alert" className="flex shrink-0 items-start gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p><Trans>The reader interface stopped working: {crash.message}</Trans></p>
            {crash.path && (
              <button type="button" className="font-mono underline" onClick={() => workspace.open(crash.path ?? "", crash.line ?? 1)}>
                {crash.component} · {crash.path}:{crash.line}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {firstPage ? (
          <iframe ref={iframeRef} title={t`Reader preview`} src={`${previewBase}/${firstPage}`} className="h-full w-full border-0 bg-white" />
        ) : (
          <div className="p-4 text-sm text-muted-foreground">
            {pages.isPending ? <Trans>Loading preview...</Trans> : <Trans>This book has no pages to preview yet.</Trans>}
          </div>
        )}
      </div>
    </div>
  )
}
