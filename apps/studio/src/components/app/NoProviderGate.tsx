import { useRef, useState, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { ArrowRight, FileText, KeyRound } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useAppLogo } from "@/hooks/use-app-logo"
import { useConnectProvider } from "@/hooks/use-connect-provider"
import { useNeedsTextProvider } from "@/hooks/use-api-key"

/** PDF → provider → ADT, with the provider as the missing link the dialog asks for. */
function ProviderFlow() {
  const logoSrc = useAppLogo()
  return (
    <div
      aria-hidden
      className="flex items-center justify-center gap-3 border-b bg-gradient-to-br from-brand-50 via-card to-card px-6 py-7 dark:from-brand-950/60"
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300">
        <FileText className="size-[22px]" />
      </span>
      <ArrowRight className="size-4 text-muted-foreground/60" />
      <span className="grid size-14 place-items-center rounded-2xl border-[1.5px] border-dashed border-brand-400 bg-card text-brand-600 shadow-[0_0_0_4px_var(--brand-50)] dark:text-brand-300 dark:shadow-none">
        <KeyRound className="size-6" />
      </span>
      <ArrowRight className="size-4 text-muted-foreground/60" />
      <span className="grid size-12 place-items-center rounded-2xl border bg-white opacity-60 shadow-sm grayscale">
        <img src={logoSrc} className="size-8" alt="" />
      </span>
    </div>
  )
}

/**
 * Asks for an AI provider before the Add Book wizard when none can run text
 * steps, so a new user learns why extraction won't run before building a book.
 * Sits on the route so every entry point is covered. Never blocks: the user can
 * continue without a provider.
 */
export function NoProviderGate({ children }: { children: ReactNode }) {
  const connect = useConnectProvider({ from: "add-book" })
  const needsProvider = useNeedsTextProvider()
  const [dismissed, setDismissed] = useState(false)
  const connectRef = useRef<HTMLButtonElement>(null)
  const open = !dismissed && needsProvider

  return (
    <>
      {children}
      <Dialog open={open} onOpenChange={(next) => !next && setDismissed(true)}>
        <DialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            connectRef.current?.focus()
          }}
          className="max-w-[460px] gap-0 overflow-hidden p-0"
        >
          <ProviderFlow />
          <DialogHeader className="gap-1.5 px-6 pt-5 text-left">
            <DialogTitle className="text-[17px] leading-tight tracking-[-0.01em]">
              <Trans>Connect an AI provider to process your book</Trans>
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              <Trans>Connect your AI provider to extract and process pages. You can still set up the book without one.</Trans>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 p-6 sm:justify-end">
            <Button
              variant="ghost"
              onClick={() => setDismissed(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <Trans>Continue without a provider</Trans>
            </Button>
            <Button ref={connectRef} onClick={connect}>
              <Trans>Connect provider</Trans>
              <ArrowRight className="size-3.5" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
