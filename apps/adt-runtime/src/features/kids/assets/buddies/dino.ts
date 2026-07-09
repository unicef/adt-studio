import type { BuddyArt } from "./buddy-art"

export const DINO_BUDDY: BuddyArt = {
  id: "dino",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><g data-part="body"><g data-part="tail"><path fill="var(--buddy-primary, #3FA34D)" d="M41 76c-14-2-27 6-32 19 13-6 24-3 35 6 5 4 13 2 15-3 2-5-1-9-6-12-4-3-8-6-12-10z"/><path fill="#000" opacity=".08" d="M13 93c11-3 22 0 33 9 4 3 9 2 12-1-3 6-10 8-16 4-10-8-21-10-34-6 1-2 3-5 5-6z"/><path fill="#FFF" opacity=".16" d="M17 90c6-5 14-8 23-7-8 1-16 5-22 11z"/></g><g data-part="crest"><ellipse cx="54" cy="22" rx="6" ry="9" fill="var(--buddy-accent, #FFB13B)" transform="rotate(18 54 22)"/><ellipse cx="76" cy="25" rx="6" ry="8" fill="var(--buddy-accent, #FFB13B)" transform="rotate(38 76 25)"/><ellipse cx="89" cy="42" rx="5" ry="8" fill="var(--buddy-accent, #FFB13B)" transform="rotate(62 89 42)"/><ellipse cx="87" cy="65" rx="5" ry="7" fill="var(--buddy-accent, #FFB13B)" transform="rotate(86 87 65)"/><ellipse cx="78" cy="82" rx="4" ry="6" fill="var(--buddy-accent, #FFB13B)" transform="rotate(112 78 82)"/><ellipse cx="42" cy="79" rx="4" ry="6" fill="var(--buddy-accent, #FFB13B)" transform="rotate(-42 42 79)"/><ellipse cx="27" cy="84" rx="4" ry="5" fill="var(--buddy-accent, #FFB13B)" transform="rotate(-55 27 84)"/></g><g data-part="limbs"><ellipse cx="41" cy="94" rx="14" ry="17" fill="var(--buddy-primary, #3FA34D)"/><ellipse cx="75" cy="94" rx="15" ry="17" fill="var(--buddy-primary, #3FA34D)"/><ellipse cx="35" cy="108" rx="4.5" ry="2.5" fill="var(--buddy-accent, #FFB13B)"/><ellipse cx="45" cy="109" rx="4.5" ry="2.5" fill="var(--buddy-accent, #FFB13B)"/><ellipse cx="69" cy="109" rx="4.5" ry="2.5" fill="var(--buddy-accent, #FFB13B)"/><ellipse cx="80" cy="108" rx="4.5" ry="2.5" fill="var(--buddy-accent, #FFB13B)"/><path fill="#FFF" opacity=".16" d="M34 86c4-4 10-5 15-1-7 0-12 3-16 9 0-3 0-6 1-8z"/><path fill="#000" opacity=".08" d="M82 83c6 5 9 12 8 21-1 6-6 10-14 10 8-5 11-15 6-31z"/></g><path fill="var(--buddy-primary, #3FA34D)" d="M37 58c6-8 18-11 31-7 15 5 25 19 25 35 0 17-13 28-31 28-20 0-33-12-33-31 0-10 3-19 8-25z"/><path fill="#FFF" opacity=".18" d="M44 60c8-7 20-8 31-3 7 3 12 8 15 15-14-9-33-11-52-2 1-4 3-7 6-10z"/><path fill="#000" opacity=".08" d="M82 57c8 7 12 17 11 29 0 17-13 28-31 28 14-7 21-21 19-39-1-7-1-13 1-18z"/><g data-part="belly"><ellipse cx="59" cy="83" rx="20" ry="25" fill="var(--buddy-secondary, #F1D58A)"/></g><g data-part="limbs"><path fill="var(--buddy-primary, #3FA34D)" d="M39 65c-7 2-11 8-9 14 1 5 8 6 13 2 4-4 5-12 1-15-2-1-3-1-5-1z"/><path fill="var(--buddy-primary, #3FA34D)" d="M79 65c7 2 11 8 9 14-1 5-8 6-13 2-4-4-5-12-1-15 2-1 3-1 5-1z"/><ellipse cx="32" cy="80" rx="3.5" ry="2" fill="var(--buddy-accent, #FFB13B)"/><ellipse cx="86" cy="80" rx="3.5" ry="2" fill="var(--buddy-accent, #FFB13B)"/><path fill="#000" opacity=".07" d="M30 78c3 3 7 4 12 3-5 4-11 2-12-3z"/><path fill="#000" opacity=".07" d="M89 78c-3 3-7 4-12 3 5 4 11 2 12-3z"/></g><g data-part="head"><path fill="var(--buddy-primary, #3FA34D)" d="M28 46c0-19 15-34 35-34 21 0 36 14 36 34 0 19-14 34-36 34-21 0-35-15-35-34z"/><path fill="#FFF" opacity=".18" d="M37 36c5-11 16-18 30-17 12 0 22 6 27 16-16-8-36-8-57 1z"/><path fill="#000" opacity=".08" d="M91 31c5 6 8 14 8 23-2 16-14 26-32 27 10-8 15-19 14-32 0-7 4-14 10-18z"/><g data-part="snout"><ellipse cx="61" cy="59" rx="25" ry="14" fill="var(--buddy-secondary, #F1D58A)"/><path fill="#FFF" opacity=".16" d="M42 55c6-6 20-8 34-4-13 0-24 3-34 9z"/><circle cx="53" cy="58" r="1.8" fill="#292F33"/><circle cx="68" cy="58" r="1.8" fill="#292F33"/></g><ellipse cx="39" cy="62" rx="5" ry="3.5" fill="#F4ABBA" opacity=".6"/><ellipse cx="83" cy="62" rx="5" ry="3.5" fill="#F4ABBA" opacity=".6"/></g><g data-part="eyes" transform-origin="61px 45px"><circle cx="49" cy="45" r="10" fill="#FFFFFF"/><circle cx="73" cy="45" r="10" fill="#FFFFFF"/><circle cx="51" cy="46" r="5.2" fill="#292F33"/><circle cx="71" cy="46" r="5.2" fill="#292F33"/><circle cx="53" cy="42" r="2" fill="#FFFFFF"/><circle cx="73" cy="42" r="2" fill="#FFFFFF"/></g><g data-part="mouth" transform-origin="61px 66px"><path d="M51 66c5 5 15 5 20 0" fill="none" stroke="#662113" stroke-width="3.5" stroke-linecap="round"/><path fill="#FFFFFF" d="M63 68c2 0 4 0 6-1l-2 6c-1 2-4 2-4 0z"/></g></g><g data-anchor="hat" transform="translate(62 14)"/><g data-anchor="eyes" transform="translate(61 45)"/><g data-anchor="neck" transform="translate(61 76)"/></svg>',
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
