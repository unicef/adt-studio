import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"

export const STARTERS: MessageDescriptor[] = [
  msg`Split the book into sections by stanza`,
  msg`Give each illustration its own section`,
  msg`One section per PDF page`,
]

export const QUICK_ACTIONS: MessageDescriptor[] = [
  msg`Simplify the language`,
  msg`Check the reading order`,
]

export function promptKey(prompt: MessageDescriptor): string {
  return prompt.id ?? String(prompt.message)
}
