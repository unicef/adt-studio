import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { defaultFolder, listConversions, readConversion } from "./conversions"
import { listPages } from "./pages"

export const getDefaultFolder = createServerFn({ method: "GET" }).handler(() => defaultFolder())

export const getConversions = createServerFn({ method: "GET" })
  .validator(z.object({ folder: z.string().trim().min(1) }))
  .handler(({ data }) => listConversions(data.folder))

const conversionInput = z.object({ booksDir: z.string().min(1), name: z.string().min(1) })

export const getConversion = createServerFn({ method: "GET" })
  .validator(conversionInput)
  .handler(({ data }) => readConversion(data.booksDir, data.name))

export const getPages = createServerFn({ method: "GET" })
  .validator(conversionInput)
  .handler(({ data }) => listPages(data.booksDir, data.name))
