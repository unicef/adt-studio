import { useIsDarkMode } from "@/hooks/use-dark-mode";
import { LinuxControls } from "./LinuxControls";
import { WindowsControls } from "./WindowsControls";
import { cn } from "@/lib/utils";

interface TitleBarControls {
  className?: string;
  darkMode?: boolean;
}
export function TitleBarControls(props: TitleBarControls) {
  const isDark = useIsDarkMode()
  const theme = props.darkMode ?? isDark ? "dark" : "light"

  return (
    <>
      <LinuxControls className={cn("self-stretch", props.className)} />
      <WindowsControls
        variant={theme}
        className={cn("self-stretch", props.className)}
      />
    </>
  );
}
