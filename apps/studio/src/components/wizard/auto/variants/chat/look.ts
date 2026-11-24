import { createContext, useContext } from "react"

/**
 * How the conversation looks: "regular" (Conversation) or "living" (Living chat: the same thread
 * with bigger bubbles and livelier motion). Only sizes and animations change, never the steps.
 */
export type ChatLook = "regular" | "living"

export const ChatLookContext = createContext<ChatLook>("regular")

export const useLiving = () => useContext(ChatLookContext) === "living"
