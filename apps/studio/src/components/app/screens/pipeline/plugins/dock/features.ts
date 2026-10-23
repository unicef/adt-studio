import { useLingui } from "@lingui/react/macro"

export const FEATURE_SECTIONS: { key: string; slugs: readonly string[] }[] = [
  { key: "essential", slugs: ["captions"] },
  { key: "access", slugs: ["toc", "easy-read", "sign-language"] },
  { key: "extras", slugs: ["quizzes", "glossary"] },
  { key: "localization", slugs: ["translate", "speech"] },
]

export const ADD_MENU_WIDTH = 680

export function useFeatureCopy() {
  const { t } = useLingui()
  return (key: string): { name: string; hint: string } =>
    key === "essential"
      ? { name: t`Essential`, hint: t`The one every book needs: screen-reader users rely on it to know what the pictures show.` }
      : key === "access"
        ? { name: t`More accessibility`, hint: t`Optional. Helps specific readers, like those who need simpler text or sign language.` }
        : key === "extras"
          ? { name: t`Learning extras`, hint: t`Optional. Add any, in any order.` }
          : { name: t`Languages & voices`, hint: t`Do these last: they translate and read aloud everything above.` }
}
