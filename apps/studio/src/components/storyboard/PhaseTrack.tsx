import { Check, Loader2, Circle, AlertCircle, ChevronRight, Play, RotateCcw, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type PhaseStatus = "pending" | "active" | "running" | "completed" | "error"

interface PhaseTrackProps {
  storyboardStatus: PhaseStatus
  proofStatus: PhaseStatus
  masterStatus: PhaseStatus
  onAcceptStoryboard: () => void
  onRunProof: () => void
  onRunMaster: () => void
  canAccept: boolean
  canRunProof: boolean
  canRunMaster: boolean
  pendingCount: number
}

function PhaseIcon({ status }: { status: PhaseStatus }) {
  switch (status) {
    case "completed":
      return <Check className="h-3.5 w-3.5 text-green-600" />
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
    case "error":
      return <AlertCircle className="h-3.5 w-3.5 text-destructive" />
    default:
      return <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
  }
}

interface StepProps {
  label: string
  actionLabel?: string
  actionIcon?: React.ReactNode
  status: PhaseStatus
  onClick?: () => void
  canRun: boolean
  hint?: string
}

function Step({ label, actionLabel, actionIcon, status, onClick, canRun, hint }: StepProps) {
  const isActionable = (status === "active" || status === "error") && canRun

  // Actionable steps render as obvious buttons
  if (isActionable) {
    const icon = actionIcon ?? (status === "error"
      ? <RotateCcw className="h-3 w-3" />
      : <Play className="h-3 w-3" />)
    const text = actionLabel ?? (status === "error" ? `Retry ${label}` : `Run ${label}`)

    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
          status === "error"
            ? "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10"
            : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10",
        )}
      >
        {icon}
        <span>{text}</span>
      </button>
    )
  }

  // Non-actionable steps are plain indicators (not buttons)
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 text-xs",
        status === "completed" && "text-green-700",
        status === "running" && "font-medium text-primary",
        status === "pending" && "text-muted-foreground/50",
        status === "active" && !canRun && "text-muted-foreground",
      )}
      title={hint}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          status === "completed" && "bg-green-100",
          status === "running" && "bg-primary/15",
          status === "pending" && "bg-muted",
          status === "active" && !canRun && "bg-muted",
        )}
      >
        <PhaseIcon status={status} />
      </span>
      <span>{label}</span>
    </div>
  )
}

export function PhaseTrack({
  storyboardStatus,
  proofStatus,
  masterStatus,
  onAcceptStoryboard,
  onRunProof,
  onRunMaster,
  canAccept,
  canRunProof,
  canRunMaster,
  pendingCount,
}: PhaseTrackProps) {
  return (
    <div className="flex items-center gap-0.5">
      <Step
        label="Storyboard"
        actionLabel="Accept Storyboard"
        actionIcon={<CheckCircle2 className="h-3 w-3" />}
        status={storyboardStatus}
        onClick={onAcceptStoryboard}
        canRun={canAccept}
        hint={
          storyboardStatus === "active" && !canAccept && pendingCount > 0
            ? `${pendingCount} pages not yet rendered`
            : undefined
        }
      />
      <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
      <Step
        label="Proof"
        status={proofStatus}
        onClick={onRunProof}
        canRun={canRunProof}
        hint={
          proofStatus === "pending"
            ? "Accept storyboard first"
            : proofStatus === "active" && !canRunProof
              ? "API key required"
              : undefined
        }
      />
      <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
      <Step
        label="Master"
        status={masterStatus}
        onClick={onRunMaster}
        canRun={canRunMaster}
        hint={
          masterStatus === "pending"
            ? "Complete proof first"
            : masterStatus === "active" && !canRunMaster
              ? "API key required"
              : undefined
        }
      />
    </div>
  )
}
