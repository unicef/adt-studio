import { ConversationFlow } from "../chat"
import "./livechat.css"

/** Variant "Living chat": the Conversation with bigger bubbles and livelier motion. */
export function LiveChatFlow() {
  return <ConversationFlow look="living" />
}
