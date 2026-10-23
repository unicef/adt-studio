import { cn } from "@/lib/utils";
import { TitleBarControls } from "./title-bar-controls";
import { usePlatform } from "@/hooks/use-platform";

interface TopBarProps {
  className?: string;
}

export function TopBar(props: TopBarProps) {
  const platform = usePlatform();
  return (
    <div
      className={cn(
        "w-full flex items-center text-foreground",
        platform === "macos" ? "h-8" : "h-12",
        platform === "windows" && "justify-end",
        props.className,
      )}
    >
      <TitleBarControls />
    </div>
  );
}
