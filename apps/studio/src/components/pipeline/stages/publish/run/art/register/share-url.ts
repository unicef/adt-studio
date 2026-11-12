/**
 * A stand-in for the address the run produces.
 *
 * 66 characters, because that is the shape of a real BYO-Cloudflare share link — subdomain, worker
 * host, book slug, route — and the length is the whole point. Every layout on this bench has to
 * decide what happens to sixty-six characters in a 44px row, and a variant reviewed with `.../abc`
 * in it has been reviewed against a link that does not exist.
 */
export const FAKE_SHARE_URL = "https://adt-books.mariaoliveira.workers.dev/o-menino-e-o-rio/read"
