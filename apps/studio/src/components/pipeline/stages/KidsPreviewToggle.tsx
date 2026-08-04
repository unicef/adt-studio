import { Trans } from "@lingui/react/macro"
import { Baby } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function KidsPreviewToggle({
  enabled,
  showingRegular,
  hidden,
  onToggle,
}: {
  enabled: boolean
  showingRegular: boolean
  hidden: boolean
  onToggle: () => void
}) {
  if (!enabled) return null

  return (
    <div
      className={cn(
        "absolute right-4 top-4 z-30 transition-all duration-200 ease-out",
        hidden
          ? "pointer-events-none -translate-y-1 opacity-0"
          : "translate-y-0 opacity-100",
      )}
    >
      <Button
        variant="outline"
        size="sm"
        onClick={onToggle}
        className="gap-1.5 rounded-full bg-background/95 shadow-md backdrop-blur-sm supports-[backdrop-filter]:bg-background/90"
      >
        <Baby className="h-4 w-4" aria-hidden />
        {showingRegular ? (
          <Trans>Back to kids UI</Trans>
        ) : (
          <Trans>Preview regular UI</Trans>
        )}
      </Button>
    </div>
  )
}
