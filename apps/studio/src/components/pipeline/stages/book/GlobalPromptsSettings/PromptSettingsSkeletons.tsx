import { FileText, Folder } from "lucide-react"

const folderRows = [
  { width: 144, files: [136, 120, 152, 128] },
  { width: 168, files: [144, 112, 160] },
  { width: 128, files: [120, 136, 104, 152] },
]

const editorLineWidths = [
  176,
  "74%",
  "52%",
  "86%",
  "68%",
  96,
  "80%",
  "48%",
  "92%",
  "61%",
  "76%",
  128,
  "58%",
  "84%",
  "46%",
]

function SkeletonBlock({
  className,
  width,
}: {
  className: string
  width?: number | string
}) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-sm bg-muted-foreground/15 ${className}`}
      style={width == null ? undefined : { width }}
    />
  )
}

export function PromptFileTreeSkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden p-2" aria-hidden="true">
      <div className="flex flex-col gap-0.5">
        {folderRows.map((folder, folderIndex) => (
          <div key={folder.width}>
            <div className="flex h-7 w-full min-w-0 items-center rounded px-2">
              <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
              <SkeletonBlock className="ml-2 h-3" width={folder.width} />
              {folderIndex === 0 && (
                <SkeletonBlock className="ml-auto h-4 w-11 rounded-full" />
              )}
            </div>

            <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l pl-2">
              {folder.files.map((width, fileIndex) => (
                <div
                  key={`${folder.width}-${width}-${fileIndex}`}
                  className="flex h-7 w-full min-w-0 items-center rounded px-2"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/35" />
                  <SkeletonBlock className="ml-2 h-3" width={width} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SelectedPromptHeaderSkeleton() {
  return (
    <div className="flex h-9 items-center gap-2 bg-background" aria-hidden="true">
      <FileText className="size-4 shrink-0 text-muted-foreground/35" />
      <SkeletonBlock className="h-4 w-64" />
    </div>
  )
}

export function PromptStatusSkeleton() {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      <SkeletonBlock className="h-5 w-20 rounded-full" />
      <SkeletonBlock className="h-5 w-24 rounded-full" />
    </div>
  )
}

export function PromptEditorSkeleton() {
  return (
    <div className="h-full w-full bg-background" aria-hidden="true">
      <div className="flex h-full min-w-0">
        <div className="w-[60px] shrink-0 border-r bg-muted/20 px-3 py-3">
          <div className="flex flex-col items-end gap-[13px]">
            {editorLineWidths.map((_, index) => (
              <SkeletonBlock key={index} className="h-3 w-5" />
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1 px-4 py-3">
          <div className="flex flex-col gap-[13px]">
            {editorLineWidths.map((width, index) => (
              <SkeletonBlock key={`${width}-${index}`} className="h-3" width={width} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
