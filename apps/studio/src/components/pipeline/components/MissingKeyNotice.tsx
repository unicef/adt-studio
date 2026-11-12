import { useBookRejectedTextProvider, useBookStructuredTextStatus } from "@/hooks/use-api-key"
import { useConnectProvider } from "@/hooks/use-connect-provider"
import { MissingKeyBanner, RejectedKeyBanner } from "@/components/key-prompt/KeyPrompt"

/**
 * Visible explanation (with a fix) for why AI steps cannot run: no text
 * provider is usable for this book, or the one it uses refuses its key. Waits
 * for the provider list and the book's config before showing, and renders
 * nothing once a working provider is connected.
 */
export function MissingKeyNotice({ bookLabel }: { bookLabel: string }) {
  const { available, ready } = useBookStructuredTextStatus(bookLabel)
  const rejected = useBookRejectedTextProvider(bookLabel)
  const connect = useConnectProvider()
  const update = useConnectProvider(rejected ? { providerId: rejected.providerId } : {})
  if (!ready) return null
  if (!available) return <MissingKeyBanner onConnect={connect} />
  if (rejected) return <RejectedKeyBanner providerId={rejected.providerId} name={rejected.displayName} onUpdate={update} />
  return null
}
