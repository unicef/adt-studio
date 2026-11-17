import type { ReaderUiLayout } from "@adt/types"
import { cn } from "@/lib/utils"

interface LayoutDiagramProps {
  layout: Required<ReaderUiLayout>
  /** Accent for the dock and drawer. */
  accent?: string
  surface?: string
  className?: string
}

/**
 * A thumbnail of a reader layout: the page, the dock on its edge, and — when
 * panels are drawers — an open drawer either over the page or pushing it.
 * Pure divs so it scales with its container and needs no assets.
 */
export function LayoutDiagram({ layout, accent = "#9333ea", surface = "#ffffff", className }: LayoutDiagramProps) {
  const vertical = layout.dock_position === "left" || layout.dock_position === "right"
  const compact = layout.dock_width === "compact"
  const drawer = layout.panel_style === "drawer"
  const push = drawer && layout.panel_behavior === "push"
  const rail = 9 // % of width
  const bar = 12 // % of height

  const dockStyle: React.CSSProperties = (() => {
    const inset = compact ? 4 : 0
    switch (layout.dock_position) {
      case "left":
        return compact
          ? { left: `${inset}%`, top: "22%", bottom: "22%", width: `${rail}%` }
          : { left: 0, top: 0, bottom: 0, width: `${rail}%` }
      case "right":
        return compact
          ? { right: `${inset}%`, top: "22%", bottom: "22%", width: `${rail}%` }
          : { right: 0, top: 0, bottom: 0, width: `${rail}%` }
      case "top":
        return compact
          ? { top: `${inset + 2}%`, left: "24%", right: "24%", height: `${bar}%` }
          : { top: 0, left: 0, right: 0, height: `${bar}%` }
      default:
        return compact
          ? { bottom: `${inset + 2}%`, left: "24%", right: "24%", height: `${bar}%` }
          : { bottom: 0, left: 0, right: 0, height: `${bar}%` }
    }
  })()

  const railOffset = (side: "left" | "right") =>
    vertical && layout.dock_position === side ? rail + (compact ? 8 : 0) : 0
  const drawerWidth = 30
  const drawerStyle: React.CSSProperties =
    layout.panel_side === "left"
      ? { left: `${railOffset("left")}%`, top: 0, bottom: 0, width: `${drawerWidth}%` }
      : { right: `${railOffset("right")}%`, top: 0, bottom: 0, width: `${drawerWidth}%` }

  const pageInset = {
    left: railOffset("left") + (push && layout.panel_side === "left" ? drawerWidth : 0),
    right: railOffset("right") + (push && layout.panel_side === "right" ? drawerWidth : 0),
    top: layout.dock_position === "top" && !compact ? bar : 0,
    bottom: layout.dock_position === "bottom" && !compact ? bar : 0,
  }

  return (
    <div
      aria-hidden
      className={cn("relative aspect-[16/10] w-full overflow-hidden rounded-md border bg-[#f4f1ea]", className)}
    >
      {/* The page */}
      <div
        className="absolute flex flex-col gap-[6%] p-[6%] transition-all duration-200"
        style={{
          left: `${pageInset.left}%`,
          right: `${pageInset.right}%`,
          top: `${pageInset.top}%`,
          bottom: `${pageInset.bottom}%`,
        }}
      >
        <div className="mx-auto flex h-full w-[70%] flex-col gap-[8%] rounded-sm bg-white p-[6%] shadow-sm">
          <div className="h-[10%] w-1/2 rounded-sm bg-slate-300" />
          <div className="h-[6%] w-full rounded-sm bg-slate-200" />
          <div className="h-[6%] w-5/6 rounded-sm bg-slate-200" />
          <div className="grid flex-1 grid-cols-3 gap-[6%]">
            <div className="rounded-sm bg-slate-100" />
            <div className="rounded-sm bg-slate-100" />
            <div className="rounded-sm bg-slate-100" />
          </div>
        </div>
      </div>

      {/* An open drawer */}
      {drawer ? (
        <div
          className={cn(
            "absolute flex flex-col gap-[5%] p-[3%] shadow-md transition-all duration-200",
            !push && "ring-1 ring-black/5",
          )}
          style={{ ...drawerStyle, background: surface }}
        >
          <div className="h-[6%] w-2/3 rounded-sm" style={{ background: accent, opacity: 0.85 }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[5%] w-full rounded-sm bg-slate-200" />
          ))}
        </div>
      ) : null}

      {/* The dock */}
      <div
        className={cn(
          "absolute flex items-center justify-center gap-[6%] shadow-sm ring-1 ring-black/10 transition-all duration-200",
          vertical ? "flex-col py-[3%]" : "px-[3%]",
          compact && "rounded-full",
        )}
        style={{ ...dockStyle, background: surface }}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn("rounded-full", vertical ? "h-[8%] w-[45%]" : "h-[45%] w-[5%]")}
            style={{ background: i === 0 ? accent : "#cbd5e1", aspectRatio: "1" }}
          />
        ))}
      </div>

      {/* Popover hint */}
      {!drawer ? (
        <div
          className="absolute h-[34%] w-[26%] rounded-sm shadow-md ring-1 ring-black/5"
          style={{
            background: surface,
            ...(layout.dock_position === "top"
              ? { top: `${bar + 6}%`, left: "30%" }
              : layout.dock_position === "left"
                ? { left: `${rail + (compact ? 10 : 3)}%`, top: "30%" }
                : layout.dock_position === "right"
                  ? { right: `${rail + (compact ? 10 : 3)}%`, top: "30%" }
                  : { bottom: `${bar + 6}%`, left: "30%" }),
          }}
        >
          <div className="m-[10%] h-[12%] w-1/2 rounded-sm" style={{ background: accent, opacity: 0.85 }} />
        </div>
      ) : null}
    </div>
  )
}
