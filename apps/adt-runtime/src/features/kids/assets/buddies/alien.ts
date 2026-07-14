import type { BuddyArt } from "./buddy-art"

export const ALIEN_BUDDY: BuddyArt = {
  id: "alien",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><g data-part="body"><g data-part="antennae"><path fill="var(--buddy-primary, #66C79A)" d="M46 20c-3-5-6-8-10-10l3-5c5 3 9 7 11 13z"/><path fill="var(--buddy-primary, #66C79A)" d="M74 20c3-5 6-8 10-10l-3-5c-5 3-9 7-11 13z"/><circle cx="37" cy="8" r="4.5" fill="var(--buddy-accent, #FFD166)"/><circle cx="83" cy="8" r="4.5" fill="var(--buddy-accent, #FFD166)"/><circle cx="35.8" cy="6.8" r="1.4" fill="#FFF" opacity=".55"/><circle cx="81.8" cy="6.8" r="1.4" fill="#FFF" opacity=".55"/></g><g data-part="limbs"><ellipse cx="50" cy="100" rx="7.5" ry="4.5" fill="var(--buddy-primary, #66C79A)"/><ellipse cx="70" cy="100" rx="7.5" ry="4.5" fill="var(--buddy-primary, #66C79A)"/><ellipse cx="48" cy="101" rx="3.5" ry="1.6" fill="#FFF" opacity=".2"/><ellipse cx="68" cy="101" rx="3.5" ry="1.6" fill="#FFF" opacity=".2"/></g><ellipse cx="60" cy="83" rx="18" ry="15.5" fill="var(--buddy-primary, #66C79A)"/><path fill="#000" opacity=".05" d="M72 73c3 6 3 13-2 18-3 4-8 6-13 5 10-3 15-12 15-23z"/><g data-part="belly"><ellipse cx="60" cy="86" rx="10" ry="8.5" fill="var(--buddy-secondary, #E0F6EA)"/></g><g data-part="limbs"><path fill="var(--buddy-primary, #66C79A)" d="M42 76c-5-2-9-1-11 3-1 3 1 6 6 6 5 1 8-6 5-9z"/><path fill="var(--buddy-primary, #66C79A)" d="M78 76c5-2 9-1 11 3 1 3-1 6-6 6-5 1-8-6-5-9z"/></g><g data-part="head"><path fill="var(--buddy-primary, #66C79A)" d="M60 8C42 8 28 22 28 40c0 17 14 28 32 28s32-11 32-28C92 22 78 8 60 8z"/><path fill="#FFF" opacity=".16" d="M36 27c5-10 14-16 26-15 10 0 18 4 22 12-14-7-31-7-48 3z"/><path fill="#000" opacity=".04" d="M87 24c4 5 5 10 5 16 0 17-14 28-32 28 12-6 20-15 21-28 0-6 2-11 6-16z"/><ellipse cx="37" cy="52" rx="4" ry="2.8" fill="#F4ABBA" opacity=".9"/><ellipse cx="83" cy="52" rx="4" ry="2.8" fill="#F4ABBA" opacity=".9"/></g><g data-part="eyes" transform-origin="60px 41px"><ellipse cx="46.5" cy="41" rx="10" ry="11.5" fill="#FFFFFF"/><ellipse cx="73.5" cy="41" rx="10" ry="11.5" fill="#FFFFFF"/><circle cx="48" cy="43" r="5.8" fill="#292F33"/><circle cx="72" cy="43" r="5.8" fill="#292F33"/><circle cx="50.4" cy="38.6" r="2.1" fill="#FFFFFF"/><circle cx="74.4" cy="38.6" r="2.1" fill="#FFFFFF"/></g><g data-part="mouth" transform-origin="60px 59px"><path d="M53 57q7 6 14 0" fill="none" stroke="#662113" stroke-width="3" stroke-linecap="round"/></g></g><g data-anchor="hat" transform="translate(60 8)"/><g data-anchor="eyes" transform="translate(60 41)"/><g data-anchor="neck" transform="translate(60 70)"/></svg>',
  palettes: [
    {
      id: "classic",
      labelKey: "kids-palette-classic",
      labelFallback: "Classic",
      primary: "#66C79A",
      secondary: "#E0F6EA",
      accent: "#FFD166",
    },
    {
      id: "cosmic",
      labelKey: "kids-palette-cosmic",
      labelFallback: "Cosmic",
      primary: "#8F7BE8",
      secondary: "#EFE6FF",
      accent: "#6EE7B7",
    },
    {
      id: "sunny",
      labelKey: "kids-palette-sunny",
      labelFallback: "Sunny",
      primary: "#F5B840",
      secondary: "#FFF3D6",
      accent: "#6EC5FF",
    },
    {
      id: "rose",
      labelKey: "kids-palette-rose",
      labelFallback: "Rose",
      primary: "#F27E9D",
      secondary: "#FFE3EC",
      accent: "#7BDACD",
    },
  ],
}
