import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import type { MDXComponents } from 'mdx/types';
import { DocsHero } from '@/components/docs/DocsHero';
import { GetStartedBanner } from '@/components/docs/GetStartedBanner';
import { WhereToBegin, Principles } from '@/components/docs/OverviewSections';
import { StageCard, StageCards } from '@/components/docs/StageCard';
import { PartnersStrip } from '@/components/docs/PartnersStrip';
import { PrincipleCards } from '@/components/docs/PrincipleCards';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Step,
    Steps,
    DocsHero,
    GetStartedBanner,
    WhereToBegin,
    Principles,
    StageCard,
    StageCards,
    PartnersStrip,
    PrincipleCards,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
