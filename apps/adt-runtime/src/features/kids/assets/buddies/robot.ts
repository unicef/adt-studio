import type { BuddyArt } from "./buddy-art"

export const ROBOT_BUDDY: BuddyArt = {
  id: "robot",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><g data-part="body"><g data-part="extra"><path d="M60 22V12" fill="none" stroke="var(--buddy-accent, #FFB84D)" stroke-width="5" stroke-linecap="round"/><circle cx="60" cy="10" r="6" fill="var(--buddy-accent, #FFB84D)"/><circle cx="62" cy="8" r="2" fill="#FFF" opacity=".22"/></g><g data-part="limbs"><rect x="21" y="45" width="16" height="24" rx="8" fill="var(--buddy-accent, #FFB84D)"/><rect x="83" y="45" width="16" height="24" rx="8" fill="var(--buddy-accent, #FFB84D)"/><path fill="#000" opacity=".08" d="M31 46c4 2 6 6 6 11 0 6-3 10-8 12h0c5 1 10-3 10-11 0-7-3-11-8-12z"/><path fill="#000" opacity=".08" d="M91 46c4 2 6 6 6 11 0 6-3 10-8 12h0c5 1 10-3 10-11 0-7-3-11-8-12z"/></g><rect x="40" y="70" width="40" height="32" rx="14" fill="var(--buddy-primary, #79C9F2)"/><path fill="#FFF" opacity=".18" d="M47 76h24c3 0 5 2 6 5-9-4-20-4-34 0 1-3 2-5 4-5z"/><path fill="#000" opacity=".08" d="M73 72c5 3 8 8 8 14 0 10-7 17-18 17 8-6 11-16 10-31z"/><g data-part="extra"><circle cx="60" cy="86" r="7" fill="var(--buddy-accent, #FFB84D)"/><circle cx="60" cy="86" r="3" fill="#FFF" opacity=".22"/></g><g data-part="limbs"><rect x="36" y="98" width="18" height="10" rx="5" fill="var(--buddy-primary, #79C9F2)"/><rect x="66" y="98" width="18" height="10" rx="5" fill="var(--buddy-primary, #79C9F2)"/><ellipse cx="45" cy="106" rx="10" ry="4" fill="#000" opacity=".08"/><ellipse cx="75" cy="106" rx="10" ry="4" fill="#000" opacity=".08"/></g><g data-part="head"><rect x="29" y="23" width="62" height="54" rx="18" fill="var(--buddy-primary, #79C9F2)"/><path fill="#FFF" opacity=".2" d="M39 29h40c4 0 7 2 9 6-15-5-32-5-58 2 1-5 4-8 9-8z"/><path fill="#000" opacity=".08" d="M83 29c6 5 9 11 9 20 0 17-11 28-29 29 10-7 15-18 15-31 0-8 2-14 5-18z"/><g data-part="face-panel"><rect x="38" y="35" width="44" height="27" rx="13.5" fill="var(--buddy-secondary, #DFF8FF)"/></g><path fill="#000" opacity=".06" d="M75 36c4 2 7 6 7 12 0 8-6 14-15 14 6-5 9-14 8-26z"/></g><g data-part="eyes" transform-origin="60px 49px"><circle cx="50" cy="49" r="8" fill="#FFFFFF"/><circle cx="70" cy="49" r="8" fill="#FFFFFF"/><circle cx="51" cy="50" r="4.4" fill="#292F33"/><circle cx="69" cy="50" r="4.4" fill="#292F33"/><circle cx="53" cy="47" r="1.8" fill="#FFFFFF"/><circle cx="71" cy="47" r="1.8" fill="#FFFFFF"/></g><g data-part="mouth" transform-origin="60px 67px"><rect x="48" y="65" width="24" height="8" rx="4" fill="#662113"/><circle cx="54" cy="68.5" r="1.6" fill="#FFF" opacity=".22"/><circle cx="60" cy="68.5" r="1.6" fill="#FFF" opacity=".22"/><circle cx="66" cy="68.5" r="1.6" fill="#FFF" opacity=".22"/></g></g><g data-anchor="hat" transform="translate(60 18)"/><g data-anchor="eyes" transform="translate(60 49)"/><g data-anchor="neck" transform="translate(60 78)"/></svg>',
  palettes: [
    {
      id: "classic",
      labelKey: "kids-palette-classic",
      labelFallback: "Classic",
      primary: "#79C9F2",
      secondary: "#DFF8FF",
      accent: "#FFB84D",
    },
    {
      id: "mint-chip",
      labelKey: "kids-palette-mint-chip",
      labelFallback: "Mint Chip",
      primary: "#5FD6BA",
      secondary: "#E7FFF7",
      accent: "#7C5CFF",
    },
    {
      id: "strawberry",
      labelKey: "kids-palette-strawberry",
      labelFallback: "Strawberry",
      primary: "#FF8BA7",
      secondary: "#FFE6EE",
      accent: "#35C2FF",
    },
    {
      id: "sunbeam",
      labelKey: "kids-palette-sunbeam",
      labelFallback: "Sunbeam",
      primary: "#FFD166",
      secondary: "#FFF4C2",
      accent: "#2EC4B6",
    },
  ],
}
