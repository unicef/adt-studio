import { useLingui } from "@lingui/react/macro"
import { Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"

/** Per-entry read-aloud mute toggle. Locked (non-interactive) when the mute
 * comes from a content-type switch or is inherited from the source entry. */
export function TtsMuteToggle({
  muted,
  lockedReason,
  onToggle,
  accent,
  disabled = false,
  disabledReason,
}: {
  muted: boolean;
  lockedReason?: string;
  onToggle: () => void;
  accent?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const { t } = useLingui();
  const title =
    lockedReason ??
    (muted ? t`Include in read-aloud` : t`Exclude from read-aloud`);
  if (accent) {
    const blocked = !!lockedReason || disabled;
    const label = lockedReason ?? (disabled && disabledReason ? disabledReason : muted ? t`Read aloud again` : t`Don't read aloud`);
    return (
      <button
        type="button"
        onClick={blocked ? undefined : onToggle}
        aria-disabled={blocked || undefined}
        aria-pressed={muted}
        title={label}
        aria-label={label}
        style={{ ["--mute-accent" as string]: accent }}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg border bg-card transition-[background-color,color,border-color,opacity] duration-200 motion-reduce:transition-none",
          "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--mute-accent)_45%,transparent)]",
          muted
            ? "border-[color-mix(in_srgb,var(--mute-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--mute-accent)_10%,transparent)] text-[var(--mute-accent)] dark:text-[color-mix(in_oklab,var(--mute-accent)_70%,white)]"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          blocked ? "cursor-default opacity-45" : "cursor-pointer",
        )}
      >
        {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
      </button>
    );
  }
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
