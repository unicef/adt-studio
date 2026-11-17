import { useAtomValue } from "jotai";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import {
  DockContext,
  type DockSide,
} from "@/features/dock/context/dock-context";
import {
  dockHiddenAtom,
  dockMenuValueAtom,
  effectiveDockLayoutAtom,
  iconSizeAtom,
  readerLayoutAtom,
  reduceMotionAtom,
  type IconSize,
} from "@/shared/state/ui.atoms";
import { AudioPlayerProvider } from "@/features/audio/hooks/AudioPlayerContext";
import { useAutoHideDock } from "@/features/dock/hooks/useAutoHideDock";
import { useDockShortcuts } from "@/features/dock/hooks/useDockShortcuts";
import { useKeyboardPageNav } from "@/features/navigation/hooks/useKeyboardPageNav";
import { useIsMobile } from "@/shared/hooks/use-is-mobile";
import { clearChromeInset, setChromeInset } from "@/shared/lib/chrome-insets";

interface DockProps {
  children: ReactNode;
}

const OPPOSITE: Record<DockSide, DockSide> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

export function Dock({ children }: DockProps) {
  const dockRef = useRef<HTMLDivElement>(null);
  const layout = useAtomValue(effectiveDockLayoutAtom);
  const hidden = useAtomValue(dockHiddenAtom);
  const menuValue = useAtomValue(dockMenuValueAtom);
  const iconSize = useAtomValue(iconSizeAtom) as IconSize;
  const reduceMotion = useAtomValue(reduceMotionAtom);
  const isMobile = useIsMobile();
  const readerLayout = useAtomValue(readerLayoutAtom);
  // A phone bar has no room for names.
  const buttonStyle = isMobile ? "icon" : readerLayout.button_style;

  useAutoHideDock(dockRef);
  useKeyboardPageNav();
  useDockShortcuts();

  // A side rail needs a desktop's width; phones keep the bottom bar.
  const edge: DockSide =
    isMobile && (layout.position === "left" || layout.position === "right")
      ? "bottom"
      : layout.position;
  const isVertical = edge === "left" || edge === "right";
  const isTop = edge === "top";
  const isCompact = layout.width === "compact";
  const isSpread = layout.align === "spread";
  const shouldHide = hidden && menuValue === "";
  const popoverSide: DockSide = OPPOSITE[edge];

  useLayoutEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const root = document.documentElement.style;
      if (isVertical) {
        // A rail takes width, not height: the book keeps its full height and
        // gives up the rail's band (plus the compact rail's float gap).
        const gap = isCompact ? 12 : 0;
        root.setProperty("--dock-width", `${rect.width}px`);
        root.setProperty("--dock-height", "0px");
        setChromeInset("rail", edge as "left" | "right", rect.width + gap * 2);
      } else {
        root.setProperty("--dock-width", `${rect.width}px`);
        // --dock-height + event let fixed-layout pages reserve the dock band and
        // re-fit (the fit script runs before the dock mounts; see package-web.ts).
        root.setProperty("--dock-height", `${rect.height}px`);
        clearChromeInset("rail");
      }
      window.dispatchEvent(new Event("adt:dock-resize"));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--dock-width");
      document.documentElement.style.removeProperty("--dock-height");
      clearChromeInset("rail");
    };
  }, [edge, isVertical, isCompact]);

  useLayoutEffect(() => {
    document.body.setAttribute("nav-position", edge);
    if (!isCompact) {
      document.body.setAttribute("nav-size", "full");
    } else {
      document.body.removeAttribute("nav-size");
    }
    return () => {
      document.body.removeAttribute("nav-position");
      document.body.removeAttribute("nav-size");
    };
  }, [isCompact, edge]);

  useLayoutEffect(() => {
    document.body.setAttribute("icon-size", iconSize);
    if (reduceMotion) document.body.setAttribute("reduce-motion", "true");
    else document.body.removeAttribute("reduce-motion");
    return () => {
      document.body.removeAttribute("icon-size");
      document.body.removeAttribute("reduce-motion");
    };
  }, [iconSize, reduceMotion]);

  return (
    <AudioPlayerProvider>
      <DockContext.Provider
        value={{
          ref: dockRef,
          popoverSide,
          isSpread,
          isTop,
          isCompact,
          shouldHide,
          isVertical,
          edge,
          buttonStyle,
        }}
      >
        {children}
      </DockContext.Provider>
    </AudioPlayerProvider>
  );
}
