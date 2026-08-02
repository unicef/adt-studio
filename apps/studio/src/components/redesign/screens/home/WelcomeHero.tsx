import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { FileText, Sparkles, Package, ArrowRight, Plus, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export interface WelcomeHeroProps {
  onOpenAdd: () => void
}

/** Home first-run welcome (design 1c): headline + PDF→AI→bundle flow card + CTAs. */
export function WelcomeHero({ onOpenAdd }: WelcomeHeroProps) {
  const navigate = useNavigate()
  return (
    <>
      <div className="text-2xl font-bold leading-[1.1] tracking-[-0.02em]">
        <Trans>Welcome to ADT Studio</Trans>
      </div>
      <div className="mt-1.5 text-sm text-muted-foreground">
        <Trans>Turn any educational PDF into an accessible, interactive learning bundle — extracted, captioned, and quiz-ready.</Trans>
      </div>

      <div className="mt-[18px] flex gap-6 rounded-2xl border bg-card p-[22px] shadow-sm">
        <div aria-hidden className="flex w-[196px] shrink-0 items-center justify-center gap-2.5 self-stretch rounded-2xl bg-brand-50">
          <span className="grid size-11 place-items-center rounded-xl bg-stage-speech/10 text-stage-speech">
            <FileText className="size-[21px]" />
          </span>
          <ArrowRight className="size-3 text-muted-foreground" />
          <span className="grid size-11 place-items-center rounded-xl bg-brand-100 text-brand-600">
            <Sparkles className="size-[21px]" />
          </span>
          <ArrowRight className="size-3 text-muted-foreground" />
          <span className="grid size-11 place-items-center rounded-xl bg-stage-validation/10 text-stage-validation">
            <Package className="size-[21px]" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <Badge variant="info" className="gap-1 px-2 text-[10.5px] uppercase tracking-[0.06em]">
            <Sparkles className="size-3" />
            <Trans>New here?</Trans>
          </Badge>
          <h2 className="mb-2 mt-3 text-xl font-bold leading-[1.25] tracking-[-0.015em]">
            <Trans>Add your first book and ADT Studio takes care of the rest.</Trans>
          </h2>
          <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
            <Trans>Drop in a textbook PDF and we&apos;ll extract pages, generate accessible captions, build storyboards, and assemble quizzes — every step inspectable, every result versioned.</Trans>
          </p>
          <div className="flex gap-2.5">
            <Button onClick={onOpenAdd}>
              <Plus className="size-3.5" />
              <Trans>Add your first book</Trans>
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/books/import" })}>
              <Upload className="size-3.5" />
              <Trans>Import existing project</Trans>
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
