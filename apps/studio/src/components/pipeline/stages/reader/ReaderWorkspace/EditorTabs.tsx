import { Trans, useLingui } from "@lingui/react/macro"
import { Eye, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { FileIcon } from "./FileIcon"
import type { ReaderWorkspaceState } from "./use-reader-workspace"

const TAB = "group flex h-9 shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-3 text-[13px] select-none"
const ACTIVE = "bg-background text-foreground shadow-[inset_0_2px_0_var(--color-primary)]"
const INACTIVE = "bg-muted/40 text-muted-foreground hover:bg-muted/70"

export function EditorTabs({ workspace }: { workspace: ReaderWorkspaceState }) {
  const { t } = useLingui()
  const { tabs, selected, previewActive, buffers, compileErrors } = workspace

  return (
    <div role="tablist" aria-label={t`Open files`} className="flex shrink-0 overflow-x-auto border-b border-border bg-muted/40">
      {workspace.label && (
        <div
          role="tab"
          tabIndex={0}
          aria-selected={previewActive}
          className={cn(TAB, previewActive ? ACTIVE : INACTIVE)}
          onClick={workspace.showPreview}
          onKeyDown={(event) => event.key === "Enter" && workspace.showPreview()}
        >
          <Eye className="size-4 shrink-0 text-emerald-600" aria-hidden />
          <Trans>Preview</Trans>
          {compileErrors.length > 0 && <span className="size-2 rounded-full bg-red-500" aria-label={t`The reader does not compile`} />}
        </div>
      )}
      {tabs.map((path) => {
        const active = !previewActive && selected === path
        const name = path.split("/").pop() ?? path
        return (
          <div
            key={path}
            role="tab"
            tabIndex={0}
            aria-selected={active}
            title={path}
            className={cn(TAB, "pr-1.5", active ? ACTIVE : INACTIVE)}
            onClick={() => workspace.open(path)}
            onKeyDown={(event) => event.key === "Enter" && workspace.open(path)}
            onAuxClick={(event) => event.button === 1 && workspace.close(path)}
          >
            <FileIcon path={path} />
            <span className="max-w-48 truncate">{name}</span>
            <button
              type="button"
              aria-label={t`Close ${name}`}
              className="relative flex size-5 items-center justify-center rounded hover:bg-muted"
              onClick={(event) => {
                event.stopPropagation()
                workspace.close(path)
              }}
            >
              {path in buffers && <span className="absolute size-2 rounded-full bg-foreground/70 group-hover:hidden" />}
              <X className={cn("size-3.5", path in buffers ? "hidden group-hover:block" : active ? "" : "invisible group-hover:visible")} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
