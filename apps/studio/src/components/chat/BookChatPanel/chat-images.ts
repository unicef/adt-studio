import { CHAT_IMAGE_TYPES } from "@adt/types"

const MAX_SIDE = 1568

export function imageFiles(files: Iterable<File> | ArrayLike<File>): File[] {
  return Array.from(files).filter((file) => (CHAT_IMAGE_TYPES as readonly string[]).includes(file.type))
}

export async function readChatImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas is not available")
  const keepTransparency = file.type === "image/png"
  if (!keepTransparency) {
    context.fillStyle = "#fff"
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return keepTransparency ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.9)
}
