/**
 * Shared Tailwind fragments for the kids interface.
 *
 * The default platform scrollbar is jarring inside the soft, rounded kids
 * chrome, so every scrollable kids surface uses the same slim sky-blue one.
 */
export const KIDS_SCROLLBAR_CLASS =
  "[scrollbar-color:#bae6fd_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-sky-200 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2 hover:[&::-webkit-scrollbar-thumb]:bg-sky-300"
