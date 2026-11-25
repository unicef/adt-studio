import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Trans } from "@lingui/react/macro"
import { api } from "@/api/client"
import { diffLines, withContext } from "@/lib/line-diff"
import { cn } from "@/lib/utils"

interface ReaderFileDiffProps {
  label: string
  path: string
  next: string
}

const ROW_STYLE = {
  same: "text-muted-foreground",
  add: "bg-green-50 text-green-900",
  del: "bg-red-50 text-red-900",
} as const

const ROW_SIGN = { same: " ", add: "+", del: "-" } as const

export function ReaderFileDiff({ label, path, next }: ReaderFileDiffProps) {
  const current = useQuery({
    queryKey: ["books", label, "reader-source", "file", path],
    queryFn: () => api.getReaderSourceFile(label, path),
    retry: false,
  })
  const rows = useMemo(() => withContext(diffLines(current.data?.content ?? "", next)), [current.data?.content, next])

  return (
    <div className="flex flex-col gap-1">
      <span className="truncate font-mono text-xs text-amber-900" title={path}>
        {path}
      </span>
      {current.isPending ? (
        <span className="text-xs text-muted-foreground">
          <Trans>Loading the current file…</Trans>
        </span>
      ) : (
        <pre data-testid="reader-file-diff" className="max-h-72 overflow-auto rounded border border-amber-200 bg-white py-1 text-xs">
          {rows.map((row, index) =>
            row.kind === "gap" ? (
              <div key={index} className="px-2 text-muted-foreground">
                <Trans>… {row.hidden} unchanged lines</Trans>
              </div>
            ) : (
              <div key={index} data-kind={row.kind} className={cn("whitespace-pre-wrap break-all px-2", ROW_STYLE[row.kind])}>
                {ROW_SIGN[row.kind]} {row.text}
              </div>
            ),
          )}
        </pre>
      )}
    </div>
  )
}
