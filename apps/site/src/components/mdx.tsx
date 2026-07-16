import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import type { MDXComponents } from 'mdx/types';
import { DocsHero } from '@/components/docs/DocsHero';
import { GetStartedBanner } from '@/components/docs/GetStartedBanner';
import { WhereToBegin, Principles } from '@/components/docs/OverviewSections';
import { StageCard, StageCards } from '@/components/docs/StageCard';
import { PartnersStrip } from '@/components/docs/PartnersStrip';
import { PrincipleCards } from '@/components/docs/PrincipleCards';
import { FeatureVisual } from '@/components/docs/FeatureVisual';
import { SectionBanner } from '@/components/docs/SectionBanner';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Accordion,
    Accordions,
    Step,
    Steps,
    Tab,
    Tabs,
    DocsHero,
    GetStartedBanner,
    WhereToBegin,
    Principles,
    StageCard,
    StageCards,
    PartnersStrip,
    PrincipleCards,
    FeatureVisual,
    SectionBanner,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
