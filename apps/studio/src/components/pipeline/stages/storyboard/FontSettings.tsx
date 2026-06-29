import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { ChevronDown, Loader2, Plus, RotateCcw, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/sonner"
import {
  useAnalyzeBookFonts,
  useApplyBookFont,
  useBookFonts,
} from "@/hooks/use-book-fonts"
import { useApiKey } from "@/hooks/use-api-key"
import { useLingui } from "@lingui/react/macro"
import { Trans } from "@lingui/react/macro"
import { FontPreviewStyles, GooglePreviewLink } from "./fonts/FontPreviewAssets"
import { CurrentFontCard } from "./fonts/CurrentFontCard"
import { AddFontDialog } from "./fonts/AddFontDialog"
import { AttachedFontsList } from "./fonts/AttachedFontsList"

const ANALYZE_POLL_MS = 3000

export function FontSettings({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const { apiKey, hasApiKey } = useApiKey()

  const [analyzing, setAnalyzing] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  const { data, isLoading } = useBookFonts(bookLabel, {
    refetchInterval: analyzing ? ANALYZE_POLL_MS : false,
  })
  const analyzeFonts = useAnalyzeBookFonts(bookLabel)
  const applyFont = useApplyBookFont(bookLabel)
  const fixedLayout = data?.current?.fixedLayout ?? false

  const clearMessages = () => {
    toast.dismiss()
  }
  const showError = (message: string) => {
    toast.error(message)
  }
  const showApplied = (message: string) => {
    toast.success(message, {
      action: {
        label: t`View in storyboard`,
        onClick: () => {
          void navigate({
            to: "/books/$label/$step",
            params: { label: bookLabel, step: "storyboard" },
          })
        },
      },
    })
  }

  const handleResetFonts = () => {
    clearMessages()
    applyFont.mutate(
      { scope: "whole", reset: true },
      {
        onSuccess: () => {
          setResetOpen(false)
          showApplied(t`Fonts have been reset to the default.`)
        },
        onError: (err) => {
          setResetOpen(false)
          showError(err.message)
        },
      },
    )
  }

  const fonts = data?.fonts ?? []
  const assignment = data?.assignment

  const allAssigned = fonts.length > 0 && fonts.every((f) => f.role !== "unassigned")
  useEffect(() => {
    if (analyzing && allAssigned) setAnalyzing(false)
  }, [analyzing, allAssigned])

  const handleAnalyze = () => {
    clearMessages()
    analyzeFonts.mutate(apiKey, {
      onSuccess: () => setAnalyzing(true),
      onError: (err) => showError(err.message),
    })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <FontPreviewStyles label={bookLabel} fonts={fonts} />
      <GooglePreviewLink current={data?.current} fonts={fonts} />

      <div>
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
          <Trans>Book Fonts</Trans>
        </h3>
        <p className="text-xs text-muted-foreground">
          <Trans>
            Attach font files or pick Google Fonts for this book. The AI assigns where each font
            is used (headings, body text, captions…) and the fonts are embedded in the final
            bundle so it works offline. Google Fonts are downloaded when extraction runs. Make
            sure you have the right to embed any uploaded font.
          </Trans>
        </p>
      </div>

      {data?.current && <CurrentFontCard current={data.current} />}

      <AddFontDialog
        bookLabel={bookLabel}
        open={addOpen}
        onOpenChange={setAddOpen}
        fonts={fonts}
        onError={showError}
      />

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t`Reset fonts to default?`}</DialogTitle>
            <DialogDescription>
              <Trans>
                This restores the default fallback font across every page and clears per-element
                font overrides and the book-wide font selection. Attached fonts stay in the list.
                Rollback is available per page from version history.
              </Trans>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              {t`Cancel`}
            </Button>
            <Button onClick={handleResetFonts} disabled={applyFont.isPending}>
              {applyFont.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              {t`Reset fonts`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <Trans>Attached fonts</Trans>
            {fonts.length > 0 && (
              <span className="ml-1.5 text-muted-foreground/70">({fonts.length})</span>
            )}
          </h4>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={fixedLayout || applyFont.isPending}
              onClick={() => {
                clearMessages()
                setResetOpen(true)
              }}
            >
              {applyFont.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              )}
              {t`Reset fonts`}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                clearMessages()
                setAddOpen(true)
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t`Add new font`}
            </Button>
            <Button
              size="sm"
              onClick={handleAnalyze}
              disabled={!hasApiKey || fonts.length === 0 || analyzeFonts.isPending || analyzing}
            >
              {analyzing || analyzeFonts.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              )}
              {analyzing ? t`Analyzing...` : t`Analyze with AI`}
            </Button>
          </div>
        </div>

        <AttachedFontsList
          bookLabel={bookLabel}
          fonts={fonts}
          assignment={assignment}
          isLoading={isLoading}
          onError={showError}
          onApplied={showApplied}
        />
      </div>

      {assignment && (
        <details className="rounded-lg border bg-muted/40 group">
          <summary className="flex cursor-pointer items-center gap-2 p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider select-none">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <Trans>AI analysis reasoning</Trans>
            <ChevronDown
              className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <p className="px-3 pb-3 text-xs text-muted-foreground whitespace-pre-wrap">
            {assignment.reasoning}
          </p>
        </details>
      )}

      {fonts.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <Trans>
            Changing fonts affects how pages are rendered — re-run Storyboard and Export to apply
            the new fonts.
          </Trans>
        </p>
      )}
    </div>
  )
}
