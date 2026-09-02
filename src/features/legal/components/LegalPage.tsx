"use client";

import { PageContainer } from "@/components/layout/PageContainer";
import { useLocale } from "@/i18n/LocaleProvider";

export type LegalPageKind = "privacy" | "terms" | "guidelines";

export function LegalPage({ kind }: { kind: LegalPageKind }) {
    const { dictionary } = useLocale();
    const title = dictionary.legal[`${kind}Title`];
    const intro = dictionary.legal[`${kind}Intro`];
    const sections = dictionary.legal[`${kind}Sections`];

    return <PageContainer className="mx-auto flex max-w-3xl flex-col gap-8 py-12 sm:py-16">
        <header className="flex flex-col gap-3"><p className="text-xs font-medium uppercase tracking-wide text-orange-ink">{dictionary.legal.lastReviewed}</p><h1 className="font-display text-3xl font-medium text-navy sm:text-4xl">{title}</h1><p className="leading-relaxed text-ink-soft">{intro}</p></header>
        <aside className="rounded-md border border-orange/30 bg-orange-tint/50 p-4 text-sm leading-relaxed text-orange-ink">{dictionary.legal.reviewNotice}</aside>
        <div className="flex flex-col gap-8">{sections.map((section) => <section key={section.title} className="flex flex-col gap-2"><h2 className="font-display text-xl font-medium text-navy">{section.title}</h2><p className="leading-relaxed text-ink-soft">{section.body}</p></section>)}</div>
    </PageContainer>;
}
