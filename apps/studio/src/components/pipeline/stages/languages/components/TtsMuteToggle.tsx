import { useLingui } from "@lingui/react/macro"
import { Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"

/** Per-entry read-aloud mute toggle. Locked (non-interactive) when the mute
 * comes from a content-type switch or is inherited from the source entry. */
export function TtsMuteToggle({
  muted,
  lockedReason,
  onToggle,
}: {
  muted: boolean;
  lockedReason?: string;
  onToggle: () => void;
}) {
  const { t } = useLingui();
  const title =
    lockedReason ??
    (muted ? t`Include in read-aloud` : t`Exclude from read-aloud`);
  return (
    <button
      type="button"
      onClick={lockedReason ? undefined : onToggle}
      disabled={!!lockedReason}
      title={title}
      aria-label={title}
      className={cn(
        "ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded align-middle transition-colors",
        muted
          ? "text-rose-600 hover:bg-rose-50"
          : "text-muted-foreground/40 hover:text-foreground hover:bg-muted",
        lockedReason ? "opacity-50 cursor-default" : "cursor-pointer",
      )}
    >
      {muted ? (
        <VolumeX className="w-3 h-3" />
      ) : (
        <Volume2 className="w-3 h-3" />
      )}
    </button>
  );
}
