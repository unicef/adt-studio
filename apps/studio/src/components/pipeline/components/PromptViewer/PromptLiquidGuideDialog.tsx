import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Trans, useLingui } from "@lingui/react/macro"
import {
  extractLiquidVariables,
  getKnownPromptVariables,
  LIQUID_SNIPPETS,
} from "./promptLiquidVariables"
import { cn } from "@/lib/utils"


export function PromptLiquidGuideDialog({
  promptName,
  content,
  className,
}: {
  promptName: string
  content: string
  className?: string
}) {
  const { t } = useLingui()
  const knownVariables = getKnownPromptVariables(promptName)
  const detectedVariables = extractLiquidVariables(content)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-8 px-2.5 text-xs", className)}
          aria-label={t`Open Liquid guide`}
        >
          <BookOpen className="h-3.5 w-3.5" />
          <Trans>Liquid guide</Trans>
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[82vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>
            <Trans>Liquid prompt guide</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Use Liquid syntax to interpolate variables, loop over arrays, and conditionally include instructions in this prompt.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
            <section className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  <Trans>Variables for this prompt</Trans>
                </h4>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  <Trans>
                    Use these names inside double braces or Liquid tags. Nested fields use dot notation.
                  </Trans>
                </p>
              </div>

              <VariablePanel
                title={t`Known variables`}
                emptyText={t`No mapped variables for this prompt yet.`}
                variables={knownVariables}
              />

              <VariablePanel
                title={t`Detected in current template`}
                emptyText={t`No variables detected in the current template.`}
                variables={detectedVariables}
              />
            </section>

            <section className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  <Trans>Liquid quick reference</Trans>
                </h4>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  <Trans>
                    Keep output schemas and IDs unchanged when editing prompts.
                  </Trans>
                </p>
              </div>

              <div className="space-y-3">
                <GuideExample
                  title={t`Print a variable`}
                  code={LIQUID_SNIPPETS.printVariable}
                />
                <GuideExample
                  title={t`Loop over an array`}
                  code={LIQUID_SNIPPETS.loopArray}
                />
                <GuideExample
                  title={t`Conditionally include text`}
                  code={LIQUID_SNIPPETS.condition}
                />
                <GuideExample
                  title={t`Apply filters`}
                  code={LIQUID_SNIPPETS.filters}
                />
                <GuideExample
                  title={t`Define chat messages`}
                  code={LIQUID_SNIPPETS.chat}
                />
                <GuideExample
                  title={t`Attach an image variable`}
                  code={LIQUID_SNIPPETS.image}
                />
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function VariablePanel({
  title,
  emptyText,
  variables,
}: {
  title: string
  emptyText: string
  variables: string[]
}) {
  return (
    <div className="rounded-md border bg-muted/10 p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {variables.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {variables.map((variable) => (
            <code
              key={variable}
              className="rounded border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground"
            >
              {variable}
            </code>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      )}
    </div>
  )
}

function GuideExample({
  title,
  code,
}: {
  title: string
  code: string
}) {
  return (
    <div className="rounded-md border bg-background">
      <div className="border-b bg-muted/20 px-3 py-2 text-xs font-medium text-foreground">
        {title}
      </div>
      <pre className="overflow-x-auto p-3 text-[11px] leading-5 text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  )
}
