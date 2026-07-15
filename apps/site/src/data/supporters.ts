export type Supporter = {
  name: string;
  href: string;
  src: string;
  heightClass: string;
};

export const SUPPORTERS: Supporter[] = [
  {
    name: "UNICEF",
    href: "https://www.unicef.org/",
    src: "logos/unicef.svg",
    heightClass: "h-7",
  },
  {
    name: "OpenAI",
    href: "https://openai.com/",
    src: "logos/openai.svg",
    heightClass: "h-5",
  },
  {
    name: "NEES",
    href: "https://nees.ufal.br/",
    src: "logos/nees.png",
    heightClass: "h-6",
  },
  {
    name: "Ceibal",
    href: "https://www.ceibal.edu.uy/",
    src: "logos/ceibal.svg",
    heightClass: "h-6",
  },
];
