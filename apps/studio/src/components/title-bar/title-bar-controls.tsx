import { useIsDarkMode } from "@/hooks/use-dark-mode";
import { LinuxControls } from "./LinuxControls";
import { WindowsControls } from "./WindowsControls";
import { cn } from "@/lib/utils";

interface TitleBarControls {
  className?: string;
}
export function TitleBarControls(props: TitleBarControls) {
  const isDark = useIsDarkMode()
  return (
    <>
      <LinuxControls className={cn("self-stretch", props.className)} />
      <WindowsControls
        variant={isDark ? "dark" : "light"}
        className={cn("self-stretch", props.className)}
      />
    </>
  );
}
