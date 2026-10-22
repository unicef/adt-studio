import { useNavigate, useSearch } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { ArrowRight, CircleCheck, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProviderCredentials } from "@/hooks/use-provider-credentials"
import { SettingsHeading, SettingsLead } from "./ui"
import { ProvidersList } from "./providers/ProvidersList"

/**
 * Shown when the user came here from the Add Book wizard and a provider is now
 * connected. Sticks to the bottom of the view, since the page is usually
 * scrolled to the provider card the user just filled in.
 */
function ContinueAddingBook() {
  const navigate = useNavigate()
  return (
    <div className="sticky bottom-24 z-10 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-lg duration-300 animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none dark:border-emerald-900 dark:bg-emerald-950">
      <CircleCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      <span className="min-w-[12rem] flex-1 text-[13px] font-medium text-emerald-900 dark:text-emerald-100">
        <Trans>AI provider connected. Your book can be processed now.</Trans>
      </span>
      <Button size="sm" className="ml-auto shrink-0" onClick={() => navigate({ to: "/books/new" })}>
        <Trans>Continue adding your book</Trans>
        <ArrowRight className="size-3.5" />
      </Button>
    </div>
  )
}

export function ProvidersSection() {
  const { from } = useSearch({ strict: false })
  const { isAvailable, isLoading, error } = useProviderCredentials()
  const showContinue = from === "add-book" && !isLoading && !error && isAvailable("structured-text")

  return (
    <>
      <SettingsHeading>
        <Trans>AI providers</Trans>
      </SettingsHeading>
      <SettingsLead>
        <Trans>Connect the engines that run the pipeline and narrate books. Keys stay on this machine; CLI providers reuse the login already on it.</Trans>
      </SettingsLead>

      <ProvidersList />

      {showContinue && <ContinueAddingBook />}

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-emerald-600" />
        <Trans>Credentials are kept in this machine&apos;s local storage and sent only to the provider you configure.</Trans>
      </div>
    </>
  )
}
