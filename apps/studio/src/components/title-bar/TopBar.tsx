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
        "w-full flex items-center h-12 text-foreground",
        platform === "windows" && "justify-end",
        props.className,
      )}
    >
      <TitleBarControls />
    </div>
  );
}
