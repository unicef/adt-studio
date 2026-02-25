const LABEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

export function isLabelFormatValid(label: string): boolean {
  return !!label && LABEL_PATTERN.test(label)
}

export function isLabelDuplicate(
  label: string,
  existingLabels: string[] | undefined
): boolean {
  if (!existingLabels) return false
  return existingLabels.includes(label)
}
