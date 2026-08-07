import { DRAG_REGION } from "@/constants";
import { MacOSTrafficLightSpacer } from "../title-bar";
import { Trans } from "@lingui/react/macro";
import { useAppLogo } from "@/hooks/use-app-logo";
import { cn } from "@/lib/utils";

interface SidebarLogoProps {
  className?: string;
}

export function SidebarLogo({ className }: SidebarLogoProps) {
  const logoSrc = useAppLogo();

  return (
    <div
      style={DRAG_REGION}
      className={cn("flex items-center gap-2.5 px-1.5 pb-4", className)}
    >
      <MacOSTrafficLightSpacer />

      <img
        src={logoSrc}
        alt=""
        className="size-8 rounded-[9px] shadow-[0_2px_7px_rgba(43,127,255,0.42)]"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-px leading-[1.1]">
        <b className="truncate text-[14.5px]">ADT Studio</b>
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <Trans>Accessible textbooks</Trans>
        </span>
      </div>
    </div>
  );
}
