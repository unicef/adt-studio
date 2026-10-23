import { useBookStructuredTextStatus } from "@/hooks/use-api-key"
import { useConnectProvider } from "@/hooks/use-connect-provider"
import { MissingKeyBanner } from "@/components/key-prompt/KeyPrompt"

/**
 * Visible explanation (with a fix) for why AI steps cannot run: no text
 * provider is usable for this book. Waits for the provider list and the book's
 * config before showing, and renders nothing once a provider is connected.
 */
export function MissingKeyNotice({ bookLabel }: { bookLabel: string }) {
  const { available, ready } = useBookStructuredTextStatus(bookLabel)
  const connect = useConnectProvider()
  if (!ready || available) return null
  return <MissingKeyBanner onConnect={connect} />
}
