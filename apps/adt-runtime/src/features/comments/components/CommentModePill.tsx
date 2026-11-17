import { useAtomValue, useSetAtom } from "jotai"
import { X } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { effectiveDockLayoutAtom } from "@/shared/state/ui.atoms"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import { commentDraftAtom, commentModeAtom } from "@/features/comments/state/comments.atoms"

/**
 * Says comment mode is on for as long as it is, at the top of the page where it can't be missed
 * — the mode now stays on after each post, so the reader needs a standing reminder and a way
 * out. Esc and the dock's comment button leave it too. Below the dock when the dock is on top.
 */
export function CommentModePill() {
  const { t } = useCommentsText()
  const setMode = useSetAtom(commentModeAtom)
  const setDraft = useSetAtom(commentDraftAtom)
  const dockLayout = useAtomValue(effectiveDockLayoutAtom)
  const dockOnTop = dockLayout.position === "top"
  /** The compact dock floats 0.75rem below the edge, which `--dock-height` doesn't count. */
  const compactDock = dockLayout.width === "compact"

  return (
    <div
      className={cn(
        "fixed left-1/2 z-[56] flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-primary py-1 pr-1 pl-3.5 text-xs text-primary-foreground shadow-lg ring-1 ring-primary/40",
        "duration-200 animate-in fade-in-0 slide-in-from-top-2 motion-reduce:animate-none",
        !dockOnTop
          ? "top-3"
          : compactDock
            ? "top-[calc(var(--dock-height,5rem)+1.5rem)]"
            : "top-[calc(var(--dock-height,5rem)+0.75rem)]",
      )}
    >
      <p role="status" className="flex min-w-0 flex-wrap items-center gap-x-1.5">
        <span className="font-semibold">{t("comments-mode-active-label")}</span>
        <span aria-hidden className="text-primary-foreground/60">
          ·
        </span>
        <span className="text-primary-foreground/90">{t("comments-mode-hint")}</span>
        <span className="hidden text-primary-foreground/75 md:inline">
          {t("comments-mode-keyboard-hint-label")}
        </span>
      </p>
      <button
        type="button"
        aria-label={t("comments-mode-exit-label")}
        title={t("comments-mode-exit-label")}
        onClick={() => {
          setMode(false)
          setDraft(null)
        }}
        className="flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-primary-foreground/20 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-foreground motion-reduce:transition-none"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </div>
  )
}
