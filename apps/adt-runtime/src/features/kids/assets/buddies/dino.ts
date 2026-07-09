import type { BuddyArt } from "./buddy-art"

export const DINO_BUDDY: BuddyArt = {
  id: "dino",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><g data-part="body"><g data-part="tail"><path fill="var(--buddy-primary, #3FA34D)" d="M44 98C32 102 18 100 10 90c-2-3 0-6 4-6 8 1 16-1 24-6 6-4 12 0 12 7 0 6-2 11-6 13z"/><path fill="#000" opacity=".08" d="M12 90c8 6 20 7 32 2-1 3-3 5-6 6-11 4-22 2-28-6 0-1 1-2 2-2z"/><path fill="var(--buddy-accent, #FFB13B)" d="M22 81q3-8 10-5-1 6-10 5z"/></g><g data-part="limbs"><ellipse cx="45" cy="104" rx="11.5" ry="7.5" fill="var(--buddy-primary, #3FA34D)"/><ellipse cx="76" cy="104" rx="11.5" ry="7.5" fill="var(--buddy-primary, #3FA34D)"/><ellipse cx="42" cy="106" rx="6" ry="2.5" fill="#FFF" opacity=".2"/><ellipse cx="73" cy="106" rx="6" ry="2.5" fill="#FFF" opacity=".2"/></g><ellipse cx="60" cy="81" rx="25" ry="23" fill="var(--buddy-primary, #3FA34D)"/><path fill="#000" opacity=".07" d="M78 64c5 8 6 18 1 27-4 8-12 13-21 13 14-6 21-19 17-35 0-2 1-4 3-5z"/><g data-part="belly"><ellipse cx="60" cy="85" rx="15.5" ry="15" fill="var(--buddy-secondary, #F1D58A)"/><path fill="#000" opacity=".05" d="M70 74c4 7 4 15-1 21-4 5-10 7-16 5 12-2 18-13 17-26z"/></g><g data-part="limbs"><path fill="var(--buddy-primary, #3FA34D)" d="M36 72c-5 1-8 5-7 9 1 3 5 4 9 2 4-3 4-9-2-11z"/><path fill="var(--buddy-primary, #3FA34D)" d="M84 72c5 1 8 5 7 9-1 3-5 4-9 2-4-3-4-9 2-11z"/></g><g data-part="crest"><path fill="var(--buddy-accent, #FFB13B)" d="M49 16q-2-9 6-10 3 7-6 10z"/><path fill="var(--buddy-accent, #FFB13B)" d="M61 13q1-9 9-8 1 8-9 8z"/><path fill="var(--buddy-accent, #FFB13B)" d="M73 16q4-8 10-5-1 8-10 5z"/></g><g data-part="head"><path fill="var(--buddy-primary, #3FA34D)" d="M60 10C41 10 27 23 27 41c0 17 14 27 33 27s33-10 33-27c0-18-14-31-33-31z"/><path fill="#FFF" opacity=".16" d="M35 30c5-11 15-17 27-16 10 0 18 5 23 13-15-8-33-7-50 3z"/><path fill="#000" opacity=".06" d="M88 26c4 5 5 10 5 15 0 17-14 27-33 27 13-5 21-14 22-27 0-6 2-11 6-15z"/><ellipse cx="56.2" cy="54.6" rx="1.7" ry="1" fill="#000" opacity=".3" transform="rotate(-22 56.2 54.6)"/><ellipse cx="63.8" cy="54.6" rx="1.7" ry="1" fill="#000" opacity=".3" transform="rotate(22 63.8 54.6)"/><ellipse cx="36.5" cy="47" rx="4.5" ry="3.2" fill="#F4ABBA" opacity=".9"/><ellipse cx="83.5" cy="47" rx="4.5" ry="3.2" fill="#F4ABBA" opacity=".9"/></g><g data-part="eyes" transform-origin="60px 38px"><circle cx="45" cy="37" r="9.5" fill="#FFFFFF"/><circle cx="75" cy="37" r="9.5" fill="#FFFFFF"/><circle cx="47" cy="39" r="4.8" fill="#292F33"/><circle cx="73" cy="39" r="4.8" fill="#292F33"/><circle cx="49" cy="35" r="1.9" fill="#FFFFFF"/><circle cx="75" cy="35" r="1.9" fill="#FFFFFF"/></g><g data-part="mouth" transform-origin="60px 60px"><path d="M47 58c5 6 21 6 26 0" fill="none" stroke="#662113" stroke-width="3.5" stroke-linecap="round"/></g></g><g data-anchor="hat" transform="translate(60 8)"/><g data-anchor="eyes" transform="translate(60 38)"/><g data-anchor="neck" transform="translate(60 68)"/></svg>',
  palettes: [
    {
      id: "classic",
      labelKey: "kids-palette-classic",
      labelFallback: "Classic",
      primary: "#3FA34D",
      secondary: "#F1D58A",
      accent: "#FFB13B",
    },
    {
      id: "melon",
      labelKey: "kids-palette-melon",
      labelFallback: "Melon",
      primary: "#55C7A5",
      secondary: "#FFF1A8",
      accent: "#FF7A8A",
    },
    {
      id: "blueberry",
      labelKey: "kids-palette-blueberry",
      labelFallback: "Blueberry",
      primary: "#5E8FE8",
      secondary: "#DDEBFF",
      accent: "#FFC857",
    },
    {
      id: "grape-pop",
      labelKey: "kids-palette-grape-pop",
      labelFallback: "Grape Pop",
      primary: "#9A72E8",
      secondary: "#F5D7FF",
      accent: "#6EE7B7",
    },
  ],
}
