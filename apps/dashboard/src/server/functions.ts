import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { defaultFolder, listConversions, readConversion } from "./conversions"

export const getDefaultFolder = createServerFn({ method: "GET" }).handler(() => defaultFolder())

export const getConversions = createServerFn({ method: "GET" })
  .validator(z.object({ folder: z.string().trim().min(1) }))
  .handler(({ data }) => listConversions(data.folder))

export const getConversion = createServerFn({ method: "GET" })
  .validator(z.object({ booksDir: z.string().min(1), name: z.string().min(1) }))
  .handler(({ data }) => readConversion(data.booksDir, data.name))
