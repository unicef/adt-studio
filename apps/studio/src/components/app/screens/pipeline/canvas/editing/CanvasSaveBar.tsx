import { Trans } from "@lingui/react/macro"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCanvasEditing } from "./CanvasEditing"
import { useStoryboardTools } from "../tools/StoryboardToolsContext"

export function CanvasSaveBar() {
  const { dirty, saving, save, discard } = useCanvasEditing()
  const tools = useStoryboardTools()
  const visible = dirty || saving
  const lift = tools?.htmlVisible ? tools.htmlHeight + 12 : 0
  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={cn(
        "pointer-events-none absolute inset-x-0 z-30 flex justify-center transition-[opacity,transform,bottom] duration-300 ease-out motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
      style={{ bottom: 104 + lift }}
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-card/95 py-1 pl-4 pr-1 text-[12px] shadow-[0_14px_36px_-16px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <span className="size-1.5 rounded-full bg-amber-500" />
        <span className="font-medium">
          <Trans>Unsaved changes on this page</Trans>
        </span>
        <button
          type="button"
          onClick={discard}
          disabled={saving}
          className="rounded-full px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <Trans>Discard</Trans>
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-1.5 font-semibold text-background transition-transform duration-150 hover:scale-[1.02] active:scale-95 disabled:opacity-70"
        >
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          <Trans>Save</Trans>
        </button>
      </div>
    </div>
  )
}
