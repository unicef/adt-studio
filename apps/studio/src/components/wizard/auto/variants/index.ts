/* eslint-disable lingui/no-unlocalized-strings -- design names shown only in the dev lab */
import type { ComponentType } from "react"
import { AddBookFlow } from "../../AddBookFlow"
import { OpenBookFlow } from "./book"
import { ConversationFlow } from "./chat"
import { GuidedFlow } from "./guided"
import { LiveChatFlow } from "./livechat"
import { PreviewFirstFlow } from "./preview"

/**
 * The Add Book designs the lab switches between. Each is a whole flow, from upload to create, that
 * reads the engine through `useEngineClient` and creates the book with `useBookCreation`.
 */
export const VARIANTS: { id: string; name: string; short: string; Component: ComponentType }[] = [
  { id: "prototype", name: "Your design", short: "Yours", Component: AddBookFlow },
  { id: "book", name: "Open book", short: "Book", Component: OpenBookFlow },
  { id: "chat", name: "Conversation", short: "Chat", Component: ConversationFlow },
  { id: "preview", name: "Preview first", short: "Preview", Component: PreviewFirstFlow },
  { id: "livechat", name: "Living chat", short: "Living chat", Component: LiveChatFlow },
  { id: "guided", name: "Guided", short: "Guided", Component: GuidedFlow },
]
