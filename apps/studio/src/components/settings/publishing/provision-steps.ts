import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import type { LucideIcon } from "lucide-react"
import {
  CheckCheck,
  Database,
  Globe,
  Lock,
  Package,
  Server,
  ShieldCheck,
  Table2,
} from "lucide-react"
import { PROVISION_STEPS, type ProvisionStepId } from "@adt/types"

interface StepCopy {
  title: MessageDescriptor
  detail: MessageDescriptor
  icon: LucideIcon
}

/** Plain-language copy for each provisioning step. The server's own labels are
 *  written for engineers; these are what the teacher reads. */
const STEP_COPY: Record<ProvisionStepId, StepCopy> = {
  "verify-token": {
    icon: ShieldCheck,
    title: msg`Checking your token`,
    detail: msg`Making sure the token works and has all four permissions.`,
  },
  "find-or-create-d1": {
    icon: Database,
    title: msg`Creating the database`,
    detail: msg`Keeps track of your published books and the comments people leave.`,
  },
  "apply-migrations": {
    icon: Table2,
    title: msg`Preparing the database`,
    detail: msg`Adds the tables it needs. Anything already there is left alone.`,
  },
  "find-or-create-r2": {
    icon: Package,
    title: msg`Creating the storage space`,
    detail: msg`Holds the pages, images and audio of each published book.`,
  },
  "upload-worker": {
    icon: Server,
    title: msg`Installing the publishing service`,
    detail: msg`The small program that shows your books and collects comments.`,
  },
  "set-mgmt-secret": {
    icon: Lock,
    title: msg`Securing the service`,
    detail: msg`So only this computer can publish or change your books.`,
  },
  "enable-workers-dev": {
    icon: Globe,
    title: msg`Setting up your web address`,
    detail: msg`The address every share link will start with.`,
  },
  "verify-deployment": {
    icon: CheckCheck,
    title: msg`Checking everything answers`,
    detail: msg`A last look before you publish your first book.`,
  },
}

export interface ProvisionStepCopy extends StepCopy {
  id: ProvisionStepId
  /** 1-based step number, from the shared contract. */
  number: number
}

/** The eight steps in server order, each with its teacher-facing copy. */
export const PROVISION_STEP_COPY: readonly ProvisionStepCopy[] = PROVISION_STEPS.map((step) => ({
  id: step.id,
  number: step.number,
  ...STEP_COPY[step.id],
}))
