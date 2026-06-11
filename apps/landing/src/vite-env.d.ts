/// <reference types="vite/client" />

declare module "*.po" {
  import type { Messages } from "@lingui/core";
  const messages: Messages;
  export { messages };
}
