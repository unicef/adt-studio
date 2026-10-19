import { useState, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { KeyRound } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useConnectProvider } from "@/hooks/use-connect-provider"
import { useProviderCredentials } from "@/hooks/use-provider-credentials"

/**
 * Asks for an AI provider before the Add Book wizard when none can run text
 * steps, so a new user learns why extraction won't run before building a book.
 * Sits on the route so every entry point is covered. Never blocks: the user can
 * continue without a provider.
 */
export function NoProviderGate({ children }: { children: ReactNode }) {
  const connect = useConnectProvider()
  const { isAvailable, isLoading, error } = useProviderCredentials()
  const [dismissed, setDismissed] = useState(false)
  const open = !dismissed && !isLoading && !error && !isAvailable("structured-text")

  return (
    <>
      {children}
      <Dialog open={open} onOpenChange={(next) => !next && setDismissed(true)}>
        <DialogContent className="max-w-[420px] gap-5 p-7">
          <DialogHeader className="items-start gap-3 text-left">
            <span
              aria-hidden
              className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300"
            >
              <KeyRound className="size-5" />
            </span>
            <DialogTitle className="text-[19px] leading-tight tracking-[-0.01em]">
              <Trans>Connect an AI provider to process your book</Trans>
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              <Trans>Connect your AI provider to extract and process pages. You can still set up the book without one.</Trans>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button onClick={connect}>
              <Trans>Connect provider</Trans>
            </Button>
            <Button variant="ghost" onClick={() => setDismissed(true)}>
              <Trans>Continue without a provider</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
