import type { BuddyArt } from "./buddy-art"

export const BUNNY_BUDDY: BuddyArt = {
  id: "bunny",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><g data-part="body"><g data-part="ears"><ellipse cx="46" cy="23" rx="8.5" ry="16" fill="var(--buddy-primary, #C9A88C)" transform="rotate(-9 46 23)"/><ellipse cx="74" cy="23" rx="8.5" ry="16" fill="var(--buddy-primary, #C9A88C)" transform="rotate(9 74 23)"/><ellipse cx="46.4" cy="24.5" rx="4.2" ry="10.5" fill="var(--buddy-secondary, #F7EEDF)" transform="rotate(-9 46.4 24.5)"/><ellipse cx="73.6" cy="24.5" rx="4.2" ry="10.5" fill="var(--buddy-secondary, #F7EEDF)" transform="rotate(9 73.6 24.5)"/><path fill="#000" opacity=".05" d="M78 12c3 4 4 9 3 15-1 4-3 7-6 9 2-8 2-16 3-24z"/></g><g data-part="limbs"><ellipse cx="48" cy="106" rx="8.5" ry="4.8" fill="var(--buddy-primary, #C9A88C)"/><ellipse cx="72" cy="106" rx="8.5" ry="4.8" fill="var(--buddy-primary, #C9A88C)"/><ellipse cx="46" cy="107" rx="4" ry="1.8" fill="#FFF" opacity=".22"/><ellipse cx="70" cy="107" rx="4" ry="1.8" fill="#FFF" opacity=".22"/></g><ellipse cx="60" cy="89" rx="19.5" ry="15" fill="var(--buddy-primary, #C9A88C)"/><path fill="#000" opacity=".07" d="M74 78c4 7 3 14-2 19-4 4-9 6-15 5 12-3 18-12 17-24z"/><g data-part="belly"><ellipse cx="60" cy="91" rx="11" ry="9.5" fill="var(--buddy-secondary, #F7EEDF)"/></g><g data-part="limbs"><path fill="var(--buddy-primary, #C9A88C)" d="M43 81c-5-2-9-1-11 3-1 3 2 6 6 6 5 0 8-6 5-9z"/><path fill="var(--buddy-primary, #C9A88C)" d="M77 81c5-2 9-1 11 3 1 3-2 6-6 6-5 0-8-6-5-9z"/></g><g data-part="head"><circle cx="60" cy="50" r="26.5" fill="var(--buddy-primary, #C9A88C)"/><path fill="#FFF" opacity=".16" d="M38 40c4-9 13-15 24-14 9 0 16 4 21 11-13-7-29-6-45 3z"/><path fill="#000" opacity=".04" d="M82 34c4 5 5 10 4 17-1 13-11 22-26 23 10-6 15-15 15-26 0-5 3-10 7-14z"/><ellipse cx="39" cy="57" rx="4.4" ry="3" fill="#F4ABBA" opacity=".9"/><ellipse cx="81" cy="57" rx="4.4" ry="3" fill="#F4ABBA" opacity=".9"/><circle cx="31.5" cy="51" r="1" fill="#292F33" opacity=".25"/><circle cx="30" cy="55.5" r="1" fill="#292F33" opacity=".25"/><circle cx="88.5" cy="51" r="1" fill="#292F33" opacity=".25"/><circle cx="90" cy="55.5" r="1" fill="#292F33" opacity=".25"/></g><g data-part="eyes" transform-origin="60px 47px"><circle cx="49" cy="46" r="8.5" fill="#FFFFFF"/><circle cx="71" cy="46" r="8.5" fill="#FFFFFF"/><circle cx="50.6" cy="47.6" r="4.3" fill="#292F33"/><circle cx="69.4" cy="47.6" r="4.3" fill="#292F33"/><circle cx="52.4" cy="44" r="1.7" fill="#FFFFFF"/><circle cx="71.2" cy="44" r="1.7" fill="#FFFFFF"/></g><g data-part="mouth" transform-origin="60px 58px"><path fill="var(--buddy-accent, #F493B0)" d="M56.8 54.5h6.4q1.2 0 .6 1.1l-3 3.6q-.8 1-1.6 0l-3-3.6q-.6-1.1.6-1.1z"/><path d="M56 62q4 3.4 8 0" fill="none" stroke="#662113" stroke-width="2.6" stroke-linecap="round"/></g></g><g data-anchor="hat" transform="translate(60 12)"/><g data-anchor="eyes" transform="translate(60 47)"/><g data-anchor="neck" transform="translate(60 74)"/></svg>',
  palettes: [
    {
      id: "classic",
      labelKey: "kids-palette-classic",
      labelFallback: "Classic",
      primary: "#C9A88C",
      secondary: "#F7EEDF",
      accent: "#F493B0",
    },
    {
      id: "snow",
      labelKey: "kids-palette-snow",
      labelFallback: "Snow",
      primary: "#B9C3D6",
      secondary: "#EFF3FA",
      accent: "#F49BB0",
    },
    {
      id: "cocoa",
      labelKey: "kids-palette-cocoa",
      labelFallback: "Cocoa",
      primary: "#A97C5B",
      secondary: "#F1E0CE",
      accent: "#FF9E7D",
    },
    {
      id: "meadow",
      labelKey: "kids-palette-meadow",
      labelFallback: "Meadow",
      primary: "#8FCBA8",
      secondary: "#E7F7ED",
      accent: "#F7B7D0",
    },
  ],
}
