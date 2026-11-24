import type { ComponentType } from "react"
import { AddBookFlow } from "../../AddBookFlow"
import { OpenBookFlow } from "./book"
import { ConversationFlow } from "./chat"
import { PreviewFirstFlow } from "./preview"

/**
 * The Add Book designs the lab switches between. Each is a whole flow, from upload to create, that
 * reads the engine through `useEngineClient` and creates the book with `useBookCreation`.
 */
export const VARIANTS: { id: string; name: string; Component: ComponentType }[] = [
  { id: "prototype", name: "Your design", Component: AddBookFlow },
  { id: "book", name: "Open book", Component: OpenBookFlow },
  { id: "chat", name: "Conversation", Component: ConversationFlow },
  { id: "preview", name: "Preview first", Component: PreviewFirstFlow },
]
