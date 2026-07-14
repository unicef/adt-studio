import type { BuddyArt } from "./buddy-art"

export const CAT_BUDDY: BuddyArt = {
  id: "cat",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><g data-part="body"><g data-part="ears"><path fill="var(--buddy-primary, #9AA2C7)" d="M37 33Q38 15 43 9q9 4 16 13z"/><path fill="var(--buddy-primary, #9AA2C7)" d="M83 33Q82 15 77 9q-9 4-16 13z"/><path fill="var(--buddy-accent, #F2A65A)" d="M41.5 28q1-11 3.5-14 5.5 3 10 9z"/><path fill="var(--buddy-accent, #F2A65A)" d="M78.5 28q-1-11-3.5-14-5.5 3-10 9z"/></g><g data-part="tail"><path fill="var(--buddy-primary, #9AA2C7)" d="M76 98c8 4 17 4 24-1 3-2 1-5-2-5-6 1-11-1-16-5-4-3-8 0-8 4 0 3 0 5 2 7z"/><path fill="#000" opacity=".08" d="M79 98c7 2 14 2 20-1-5 5-13 6-21 2 0-1 0-1 1-1z"/><ellipse cx="97" cy="93" rx="4" ry="3.2" fill="var(--buddy-accent, #F2A65A)"/></g><g data-part="limbs"><ellipse cx="48" cy="105" rx="8.5" ry="4.8" fill="var(--buddy-primary, #9AA2C7)"/><ellipse cx="72" cy="105" rx="8.5" ry="4.8" fill="var(--buddy-primary, #9AA2C7)"/><ellipse cx="46" cy="106" rx="4" ry="1.8" fill="#FFF" opacity=".22"/><ellipse cx="70" cy="106" rx="4" ry="1.8" fill="#FFF" opacity=".22"/></g><ellipse cx="60" cy="88" rx="19.5" ry="15" fill="var(--buddy-primary, #9AA2C7)"/><path fill="#000" opacity=".07" d="M74 77c4 7 3 14-2 19-4 4-9 6-15 5 12-3 18-12 17-24z"/><g data-part="belly"><ellipse cx="60" cy="90" rx="11" ry="9.5" fill="var(--buddy-secondary, #F4EDE2)"/></g><g data-part="limbs"><path fill="var(--buddy-primary, #9AA2C7)" d="M43 80c-5-2-9-1-11 3-1 3 2 6 6 6 5 0 8-6 5-9z"/><path fill="var(--buddy-primary, #9AA2C7)" d="M77 80c5-2 9-1 11 3 1 3-2 6-6 6-5 0-8-6-5-9z"/></g><g data-part="head"><ellipse cx="60" cy="48" rx="28" ry="25.5" fill="var(--buddy-primary, #9AA2C7)"/><path fill="#FFF" opacity=".16" d="M37 38c4-9 13-15 24-14 10 0 17 4 22 11-13-7-30-6-46 3z"/><path fill="#000" opacity=".04" d="M84 32c4 5 5 10 4 16-1 13-11 22-27 23 10-6 16-15 16-26 0-5 3-9 7-13z"/><path d="M28 47l13 2M27 55l14 0" fill="none" stroke="#292F33" stroke-width="1.6" stroke-linecap="round" opacity=".3"/><path d="M92 47l-13 2M93 55l-14 0" fill="none" stroke="#292F33" stroke-width="1.6" stroke-linecap="round" opacity=".3"/><ellipse cx="40" cy="56" rx="4.4" ry="3" fill="#F4ABBA" opacity=".9"/><ellipse cx="80" cy="56" rx="4.4" ry="3" fill="#F4ABBA" opacity=".9"/></g><g data-part="eyes" transform-origin="60px 45px"><circle cx="48.5" cy="44.5" r="8.5" fill="#FFFFFF"/><circle cx="71.5" cy="44.5" r="8.5" fill="#FFFFFF"/><circle cx="50" cy="46" r="4.3" fill="#292F33"/><circle cx="70" cy="46" r="4.3" fill="#292F33"/><circle cx="51.8" cy="42.4" r="1.7" fill="#FFFFFF"/><circle cx="71.8" cy="42.4" r="1.7" fill="#FFFFFF"/></g><g data-part="mouth" transform-origin="60px 57px"><path fill="var(--buddy-accent, #F2A65A)" d="M57.2 53.5h5.6q1.1 0 .5 1l-2.6 3.1q-.7.9-1.4 0l-2.6-3.1q-.6-1 .5-1z"/><path d="M55 60q2.5 3 5 0 2.5 3 5 0" fill="none" stroke="#662113" stroke-width="2.4" stroke-linecap="round"/></g></g><g data-anchor="hat" transform="translate(60 12)"/><g data-anchor="eyes" transform="translate(60 45)"/><g data-anchor="neck" transform="translate(60 71)"/></svg>',
  palettes: [
    {
      id: "classic",
      labelKey: "kids-palette-classic",
      labelFallback: "Classic",
      primary: "#9AA2C7",
      secondary: "#F4EDE2",
      accent: "#F2A65A",
    },
    {
      id: "midnight",
      labelKey: "kids-palette-midnight",
      labelFallback: "Midnight",
      primary: "#5E6C9E",
      secondary: "#DDE3F5",
      accent: "#FFC857",
    },
    {
      id: "ginger",
      labelKey: "kids-palette-ginger",
      labelFallback: "Ginger",
      primary: "#E89A5D",
      secondary: "#FBEBD8",
      accent: "#8FCBB4",
    },
    {
      id: "rose",
      labelKey: "kids-palette-rose",
      labelFallback: "Rose",
      primary: "#EF9FB6",
      secondary: "#FDE9F0",
      accent: "#8FB7F0",
    },
  ],
}
