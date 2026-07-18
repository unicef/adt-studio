import { useAtomValue } from "jotai";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import {
  DockContext,
  type DockSide,
} from "@/features/dock/context/dock-context";
import {
  dockAlignAtom,
  dockHiddenAtom,
  dockMenuValueAtom,
  dockPositionAtom,
  dockWidthAtom,
  iconSizeAtom,
  reduceMotionAtom,
  type DockAlign,
  type DockPosition,
  type DockWidth,
  type IconSize,
} from "@/shared/state/ui.atoms";
import { AudioPlayerProvider } from "@/features/audio/hooks/AudioPlayerContext";
import { useAutoHideDock } from "@/features/dock/hooks/useAutoHideDock";
import { useDockShortcuts } from "@/features/dock/hooks/useDockShortcuts";
import { useKeyboardPageNav } from "@/features/navigation/hooks/useKeyboardPageNav";

interface DockProps {
  children: ReactNode;
}

export function Dock({ children }: DockProps) {
  const dockRef = useRef<HTMLDivElement>(null);
  const position = useAtomValue(dockPositionAtom) as DockPosition;
  const width = useAtomValue(dockWidthAtom) as DockWidth;
  const align = useAtomValue(dockAlignAtom) as DockAlign;
  const hidden = useAtomValue(dockHiddenAtom);
  const menuValue = useAtomValue(dockMenuValueAtom);
  const iconSize = useAtomValue(iconSizeAtom) as IconSize;
  const reduceMotion = useAtomValue(reduceMotionAtom);

  useAutoHideDock(dockRef);
  useKeyboardPageNav();
  useDockShortcuts();

  const isTop = position === "top";
  const isCompact = width === "compact";
  const isSpread = align === "spread";
  const shouldHide = hidden && menuValue === "";
  const popoverSide: DockSide = isTop ? "bottom" : "top";

  useLayoutEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      document.documentElement.style.setProperty("--dock-width", `${rect.width}px`);
      // --dock-height + event let fixed-layout pages reserve the dock band and
      // re-fit (the fit script runs before the dock mounts; see package-web.ts).
      document.documentElement.style.setProperty("--dock-height", `${rect.height}px`);
      window.dispatchEvent(new Event("adt:dock-resize"));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--dock-width");
      document.documentElement.style.removeProperty("--dock-height");
    };
  }, []);

  useLayoutEffect(() => {
    document.body.setAttribute("nav-position", isTop ? "top" : "bottom");
    if (!isCompact) {
      document.body.setAttribute("nav-size", "full");
    } else {
      document.body.removeAttribute("nav-size");
    }
    return () => {
      document.body.removeAttribute("nav-position");
      document.body.removeAttribute("nav-size");
    };
  }, [isCompact, isTop]);

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
        }}
      >
        {children}
      </DockContext.Provider>
    </AudioPlayerProvider>
  );
}
