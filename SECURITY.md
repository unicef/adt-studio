# Security Policy

ADT Studio turns PDFs into accessible digital textbooks (ADTs) that are read by
learners, often children. We take the security of the Studio and of the books it
produces seriously, and we appreciate reports that help us keep both safe.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, pull
requests or discussions.**

Report them privately through GitHub instead:

1. Go to the repository's [**Security** tab](https://github.com/unicef/adt-studio/security).
2. Click **Report a vulnerability**, or open the
   [private report form](https://github.com/unicef/adt-studio/security/advisories/new)
   directly.

Only the maintainers can see your report. We can discuss it with you privately there,
work on a fix in a private fork, and publish an advisory when it's fixed.

<!-- TO CONFIRM: add an official UNICEF security contact or vulnerability disclosure
     program here, if one exists and must be listed. -->

### What to include

The more of this you can give us, the faster we can act:

- the affected component (see [Scope](#scope)) and version, release tag or commit;
- steps to reproduce, or a proof of concept;
- the impact as you understand it: what an attacker can do, and what they need first;
- any suggested fix or mitigation.

## Supported versions

<!-- TO CONFIRM: which releases receive security fixes. -->

| Version | Supported |
|---------|-----------|
| Latest stable release (currently `v0.9.x`) | Yes |
| Latest beta and the `develop` branch | Yes |
| Older releases | No. Please upgrade to the latest stable release |

## Scope

In scope:

- **ADT Studio**: the web app (`apps/studio`), the API server (`apps/api`), the
  desktop app (`apps/desktop`) and the Docker image (`ghcr.io/unicef/adt-studio`).
- **Generated ADTs and the reader runtime** (`apps/adt-runtime`): web exports and
  packaged books.
- **Content-driven attacks.** For example, a crafted source PDF, or LLM output it
  influences, that leads to script execution or data exposure in Studio or in an
  exported book.

Out of scope:

- vulnerabilities in third-party services ADT Studio calls (LLM, speech and image
  providers): report those to the provider;
- content a book's author deliberately writes into their own book in Studio, since
  authors are trusted;
- findings that need an already compromised machine or account, or physical access;
- missing hardening without a demonstrated impact (for example, security headers alone).

If you're unsure whether something is in scope, report it privately anyway.

## What to expect

<!-- TO CONFIRM: response times the team can reliably meet. -->

- We aim to acknowledge your report within **5 business days**.
- We aim to send an initial assessment (whether we can reproduce it, and how severe
  we think it is) within **10 business days**.
- We'll keep you updated while we work on a fix, and tell you when it's released.
- We follow coordinated disclosure. Please give us a reasonable time to release a fix
  before sharing details publicly. We publish a GitHub security advisory once a fix is
  available, and can request a CVE.
- With your permission, we'll credit you in the advisory.

Thank you for helping keep ADT Studio and its readers safe.
