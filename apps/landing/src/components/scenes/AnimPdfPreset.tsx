import { Check, FileText } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import { cn } from "@/lib/cn";
import { lerp, seg } from "@/lib/seg";
import { Cursor } from "@/components/Cursor";

export function AnimPdfPreset({ progress }: { progress: number }) {
  const p = progress;

  let cx: number, cy: number;
  if (p < 0.03) {
    const tEnter = seg(p, 0, 0.03);
    cx = lerp(15, 28, tEnter);
    cy = lerp(115, 80, tEnter);
  } else if (p < 0.18) {
    const tDrag = seg(p, 0.03, 0.18);
    cx = lerp(28, 50, tDrag);
    cy = lerp(80, 50, tDrag);
  } else {
    cx = 50;
    cy = 50;
  }

  const dragging = p >= 0.015 && p < 0.21;
  const dropped = p >= 0.21;
  const loading = p >= 0.21 && p < 0.55;
  const success = p >= 0.55;

  return (
    <div className="absolute inset-0">
      <div
        className={cn(
          "absolute inset-4 flex items-center justify-center rounded-2xl border-2 border-dashed transition-colors duration-300",
          dropped
            ? "border-[color:var(--color-primary)] bg-blue-50"
            : dragging
              ? "border-[color:var(--color-primary)]/70 bg-blue-50/50"
              : "border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40",
        )}
      >
        <div
          className={cn(
            "flex flex-col items-center gap-3 transition-all duration-300",
            dragging || dropped ? "pointer-events-none opacity-0" : "opacity-100",
          )}
        >
          <FileText className="h-10 w-10 text-[color:var(--color-muted-foreground)]" />
          <span className="text-sm text-[color:var(--color-muted-foreground)]">
            <Trans>Drop a PDF to get started</Trans>
          </span>
        </div>

        <span
          className={cn(
            "absolute text-sm font-semibold text-[color:var(--color-primary)] transition-opacity duration-300",
            dragging && !dropped ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <Trans>Release to upload</Trans>
        </span>

        <div
          className={cn(
            "absolute flex flex-col items-center gap-3 transition-all duration-500 ease-out",
            dropped
              ? "translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-2 scale-95 opacity-0",
          )}
        >
          <div className="flex items-center gap-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-5 py-3 shadow-md">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]">
              <FileText className="h-5 w-5" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-[color:var(--color-foreground)]">
                agua-doce-vol1.pdf
              </div>
              <div className="mt-0.5 font-mono text-xs text-[color:var(--color-muted-foreground)]">
                238 pages · 14.2 MB
              </div>
            </div>
            <div className="relative ml-2 h-6 w-6">
              <span
                className={cn(
                  "absolute inset-0 grid place-items-center transition-opacity duration-300",
                  loading ? "opacity-100" : "opacity-0",
                )}
              >
                <span
                  className="h-4 w-4 rounded-full border-2 border-[color:var(--color-primary)]/25 border-t-[color:var(--color-primary)]"
                  style={{ animation: "onboarding-spin 0.7s linear infinite" }}
                />
              </span>
              <span
                className={cn(
                  "absolute inset-0 grid place-items-center transition-opacity duration-300",
                  success ? "opacity-100" : "opacity-0",
                )}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)]">
                  <Check className="h-3.5 w-3.5" />
                </span>
              </span>
            </div>
          </div>

          <div
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold text-[color:var(--color-primary)] transition-all duration-500 ease-out",
              success
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-1 opacity-0",
            )}
          >
            <Check className="h-3 w-3" />
            <Trans>Successfully uploaded</Trans>
          </div>
        </div>
      </div>

      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute z-20 flex items-center gap-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-5 py-3 shadow-2xl transition-opacity duration-300",
          dragging ? "opacity-100" : "opacity-0",
        )}
        style={{
          left: `${cx}%`,
          top: `${cy}%`,
          transform: "translate(-4px, -2px) rotate(-3deg) scale(1.04)",
          transformOrigin: "top left",
        }}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]">
          <FileText className="h-5 w-5" />
        </div>
        <div className="text-left">
          <div className="text-sm font-semibold text-[color:var(--color-foreground)]">
            agua-doce-vol1.pdf
          </div>
          <div className="mt-0.5 font-mono text-xs text-[color:var(--color-muted-foreground)]">
            14.2 MB
          </div>
        </div>
      </div>

      <Cursor x={cx} y={cy} visible={p <= 0.95} />
    </div>
  );
}
