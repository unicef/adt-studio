import { z } from "zod"

/** Local artifact receipt. Book-local page IDs, or two absent UUIDs, cannot
 * establish that retained output belongs to this book. */
export const PackageOwnershipReceipt = z.object({
  format: z.literal("adt-package-owners-v2"),
  bookId: z.string().uuid(),
  entries: z.array(z.tuple([z.string().min(1), z.string().nullable(), z.string().regex(/^[a-f0-9]{64}$/)])),
  preloader: z.string().regex(/^[a-f0-9]{64}$/),
})
export type PackageOwnershipReceipt = z.infer<typeof PackageOwnershipReceipt>

/** Local files declared by the generated Webpub reader. */
export const DerivedWebpubFiles = z.object({
  readingOrder: z.array(z.object({ href: z.string().min(1) })).nonempty(),
  resources: z.array(z.object({ href: z.string().min(1) })),
})
