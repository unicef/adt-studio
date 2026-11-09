export type TextInput = HTMLInputElement | HTMLTextAreaElement

/** Match the browser's effective type without rewriting saved legacy HTML. */
export function getTextInputs(section: HTMLElement): TextInput[] {
  return Array.from(section.querySelectorAll<TextInput>(
    "input:not(#filter-input), textarea:not(#filter-input)",
  )).filter((input) => input.tagName === "TEXTAREA" || input.type === "text")
}
