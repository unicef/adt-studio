import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Languages, Layers, RefreshCw, Sparkles } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Assistant } from "../../shared/Assistant"
import { useIsWizard, WizardPose } from "../../shared/WizardPose"

/** What the two language choices do, in the assistant's words, for the "How do languages work?" link. */
export function LanguageHelp({ open, onOpenChange, found }: { open: boolean; onOpenChange: (open: boolean) => void; found: string | null }) {
  const wizard = useIsWizard()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[6vh] max-h-[88vh] max-w-[620px] translate-y-0 gap-0 overflow-y-auto p-0">
        <div className="flex items-center gap-3 border-b border-border px-6 py-5 pr-14">
          {wizard ? <WizardPose pose="hello" size={60} className="-my-2 shrink-0" /> : <Assistant mood="talking" size={40} />}
          <div className="min-w-0">
            <DialogTitle className="text-[18px] font-semibold">
              <Trans>How languages work</Trans>
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-[13.5px]">
              <Trans>Two choices: the language you edit in, and any extra languages for the finished book.</Trans>
            </DialogDescription>
          </div>
        </div>
        <div className="flex flex-col gap-5 px-6 py-5 text-[14px] leading-relaxed">
          <Part icon={<Languages className="size-4" />} title={<Trans>The language you edit in</Trans>}>
            {found ? (
              <Trans>The text you see and edit in the book. It starts as {found}, the language I found in your PDF, so nothing is translated.</Trans>
            ) : (
              <Trans>The text you see and edit in the book. It starts as the book&apos;s own language, so nothing is translated.</Trans>
            )}{" "}
            <Trans>Pick another one only if you want the text translated into it when the book is set up.</Trans>
          </Part>
          <Part icon={<Layers className="size-4" />} title={<Trans>Extra languages</Trans>}>
            <Trans>Each one is another version of the finished book, translated from the language you edit in. The book you edit stays as it is.</Trans>
          </Part>
          <Part icon={<Sparkles className="size-4" />} title={<Trans>Translation uses the AI</Trans>}>
            <Trans>A new edit language and every extra language are translated by the AI, so setting up takes longer and uses AI credits.</Trans>
          </Part>
          <Part icon={<RefreshCw className="size-4" />} title={<Trans>Can I change it later?</Trans>}>
            <Trans>You can change both until you set up the book, and add more languages later from the book&apos;s Translate step.</Trans>
          </Part>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Part({ icon, title, children }: { icon: ReactNode; title: ReactNode; children: ReactNode }) {
  return (
    <section className="flex gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{icon}</span>
      <div className="min-w-0">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-0.5 text-muted-foreground">{children}</p>
      </div>
    </section>
  )
}
