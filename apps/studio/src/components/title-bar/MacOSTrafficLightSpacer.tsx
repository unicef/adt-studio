import type { CSSProperties } from "react"
import { usePlatform } from "@/hooks/use-platform"
import { useWindowControls } from "@/hooks/use-window-controls";

export function MacOSTrafficLightSpacer({ style }: { style?: CSSProperties } = {}) {
  const { available } = useWindowControls()
  const platform = usePlatform()

  if (platform !== "macos" || !available) return null

  return (
    <div aria-hidden="true" style={style} className="w-[80px] shrink-0 h-full self-stretch select-none" />
  );
}
