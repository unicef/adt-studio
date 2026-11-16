import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { PUBLISH_STEPS, type PublishStepId } from "@adt/types"

interface StepCopy {
  title: MessageDescriptor
  detail: MessageDescriptor
}

/** The server's step labels are written for engineers; these are what the author
 *  reads while the four steps run. */
const STEP_COPY: Record<PublishStepId, StepCopy> = {
  export: {
    title: msg`Making a copy of the book`,
    detail: msg`Building the web pages exactly as they look right now.`,
  },
  package: {
    title: msg`Packing it up`,
    detail: msg`Bundling the pages, images and audio into one file to send.`,
  },
  upload: {
    title: msg`Sending it to your Cloudflare account`,
    detail: msg`This is the longest step on a big book — it's safe to wait here.`,
  },
  register: {
    title: msg`Creating your share link`,
    detail: msg`Turning on the link and getting it ready to open.`,
  },
}

export interface PublishStepCopy extends StepCopy {
  id: PublishStepId
  /** 1-based step number, from the shared contract. */
  number: number
}

/** The four steps in server order, each with its author-facing copy. */
export const PUBLISH_STEP_COPY: readonly PublishStepCopy[] = PUBLISH_STEPS.map((step) => ({
  id: step.id,
  number: step.number,
  ...STEP_COPY[step.id],
}))
