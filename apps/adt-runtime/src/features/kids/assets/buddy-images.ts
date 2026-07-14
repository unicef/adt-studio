/**
 * GPT-Image-2 generated PNG buddy assets.
 *
 * Layout contract — one folder per character, files named `<id>_<n>.png`:
 *
 *   images/<id>/<id>_1.png   standing    (base pose, FAB + picker)
 *   images/<id>/<id>_2.png   signature   (character-specific pose)
 *   images/<id>/<id>_3.png   happy
 *   images/<id>/<id>_4.png   excited
 *   images/<id>/<id>_5.png   thinking
 *   images/<id>/<id>_6.png   surprised
 *   images/<id>/<id>_7.png   encouraging
 *
 * Future user-created characters follow the same numbering, so an image set
 * is fully described by a folder of numbered files. Built-in sets use static
 * imports (bundled as data URLs by both Vite and the esbuild book build);
 * custom sets can be plain runtime URLs in the same `BuddyImageSet` shape.
 * The SVG system (characters.ts / KidsBuddyArt) remains as a separate layer.
 */
import alien1 from "./images/alien/alien_1.png"
import alien2 from "./images/alien/alien_2.png"
import alien3 from "./images/alien/alien_3.png"
import alien4 from "./images/alien/alien_4.png"
import alien5 from "./images/alien/alien_5.png"
import alien6 from "./images/alien/alien_6.png"
import alien7 from "./images/alien/alien_7.png"
import bunny1 from "./images/bunny/bunny_1.png"
import bunny2 from "./images/bunny/bunny_2.png"
import bunny3 from "./images/bunny/bunny_3.png"
import bunny4 from "./images/bunny/bunny_4.png"
import bunny5 from "./images/bunny/bunny_5.png"
import bunny6 from "./images/bunny/bunny_6.png"
import bunny7 from "./images/bunny/bunny_7.png"
import cat1 from "./images/cat/cat_1.png"
import cat2 from "./images/cat/cat_2.png"
import cat3 from "./images/cat/cat_3.png"
import cat4 from "./images/cat/cat_4.png"
import cat5 from "./images/cat/cat_5.png"
import cat6 from "./images/cat/cat_6.png"
import cat7 from "./images/cat/cat_7.png"
import dino1 from "./images/dino/dino_1.png"
import dino2 from "./images/dino/dino_2.png"
import dino3 from "./images/dino/dino_3.png"
import dino4 from "./images/dino/dino_4.png"
import dino5 from "./images/dino/dino_5.png"
import dino6 from "./images/dino/dino_6.png"
import dino7 from "./images/dino/dino_7.png"
import robot1 from "./images/robot/robot_1.png"
import robot2 from "./images/robot/robot_2.png"
import robot3 from "./images/robot/robot_3.png"
import robot4 from "./images/robot/robot_4.png"
import robot5 from "./images/robot/robot_5.png"
import robot6 from "./images/robot/robot_6.png"
import robot7 from "./images/robot/robot_7.png"

export type BuddyExpression =
  | "standing"
  | "signature"
  | "happy"
  | "excited"
  | "thinking"
  | "surprised"
  | "encouraging"

/** File-number convention shared by built-in and future custom characters. */
export const BUDDY_EXPRESSION_NUMBERS: Record<BuddyExpression, number> = {
  standing: 1,
  signature: 2,
  happy: 3,
  excited: 4,
  thinking: 5,
  surprised: 6,
  encouraging: 7,
}

export interface BuddyImageSet {
  id: string
  labelFallback: string
  defaultNameFallback: string
  standing: string
  signature: string
  happy: string
  excited: string
  thinking: string
  surprised: string
  encouraging: string
}

export const BUDDY_IMAGE_SETS: readonly BuddyImageSet[] = [
  {
    id: "dino",
    labelFallback: "Dinosaur",
    defaultNameFallback: "Rex",
    standing:    dino1,
    signature:   dino2,
    happy:       dino3,
    excited:     dino4,
    thinking:    dino5,
    surprised:   dino6,
    encouraging: dino7,
  },
  {
    id: "robot",
    labelFallback: "Robot",
    defaultNameFallback: "Bolt",
    standing:    robot1,
    signature:   robot2,
    happy:       robot3,
    excited:     robot4,
    thinking:    robot5,
    surprised:   robot6,
    encouraging: robot7,
  },
  {
    id: "bunny",
    labelFallback: "Bunny",
    defaultNameFallback: "Pip",
    standing:    bunny1,
    signature:   bunny2,
    happy:       bunny3,
    excited:     bunny4,
    thinking:    bunny5,
    surprised:   bunny6,
    encouraging: bunny7,
  },
  {
    id: "cat",
    labelFallback: "Cat",
    defaultNameFallback: "Luna",
    standing:    cat1,
    signature:   cat2,
    happy:       cat3,
    excited:     cat4,
    thinking:    cat5,
    surprised:   cat6,
    encouraging: cat7,
  },
  {
    id: "alien",
    labelFallback: "Alien",
    defaultNameFallback: "Zibby",
    standing:    alien1,
    signature:   alien2,
    happy:       alien3,
    excited:     alien4,
    thinking:    alien5,
    surprised:   alien6,
    encouraging: alien7,
  },
]

export function getBuddyImages(id: string): BuddyImageSet {
  return BUDDY_IMAGE_SETS.find((s) => s.id === id) ?? BUDDY_IMAGE_SETS[0]
}

export function getBuddyImageSrc(
  id: string,
  variant: BuddyExpression = "standing",
): string {
  return getBuddyImages(id)[variant]
}
