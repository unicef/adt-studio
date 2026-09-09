import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { type Screen, screenSrc } from "@/data/screens";
import { useLingui } from "@lingui/react/macro";

/** A macOS-style window frame around a real app screenshot. */
export function AppWindow({
  screen,
  title,
  className,
  imgClassName,
  priority = false,
  children,
}: {
  screen: Screen;
  title?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  children?: ReactNode;
}) {
  const { i18n } = useLingui();
  return (
    <figure
      className={cn(
        "relative overflow-hidden rounded-[14px] border border-ink-line bg-white shadow-window",
        className,
      )}
    >
      <div className="flex h-9 items-center gap-1.5 border-b border-ink-line bg-paper px-3.5">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        {title ? (
          <span className="ml-3 truncate text-[11px] font-semibold text-ink-mute">{title}</span>
        ) : null}
      </div>
      <img
        src={screenSrc(screen)}
        alt={i18n._(screen.alt)}
        width={screen.width}
        height={screen.height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className={cn("block w-full", imgClassName)}
      />
      {children}
    </figure>
  );
}
