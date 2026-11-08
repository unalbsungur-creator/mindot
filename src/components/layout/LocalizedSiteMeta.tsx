"use client";

import { useEffect } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { dictionaries } from "@/i18n/translations";

const TITLE_SELECTORS = ['meta[property="og:title"]', 'meta[name="twitter:title"]'];
const DESCRIPTION_SELECTORS = ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]'];

/**
 * MB-01: the site's default title/description in the viewer's own language.
 *
 * There is no per-language URL, so the server HTML — what link-preview
 * crawlers read — always carries the default locale's (`tr`) `siteMeta`
 * (root `layout.tsx`). After hydration, this swaps the default title and
 * description tags to the viewer's locale. Only tags that currently hold
 * *some* locale's default `siteMeta` value are touched, so a page with its
 * own title or description (`/board`, `/about`, a personal wall…) keeps it.
 * A MutationObserver re-applies after Next.js rewrites the head on client
 * navigation; setting an unchanged value is skipped, so it can't loop.
 */
export function LocalizedSiteMeta() {
  const { dictionary } = useLocale();

  useEffect(() => {
    const all = Object.values(dictionaries).map((d) => d.siteMeta);
    const defaultTitles = new Set(all.map((m) => m.title));
    const defaultDescriptions = new Set(all.map((m) => m.description));
    const { title, description } = dictionary.siteMeta;

    function apply() {
      if (defaultTitles.has(document.title) && document.title !== title) document.title = title;
      for (const selector of TITLE_SELECTORS) {
        document.querySelectorAll<HTMLMetaElement>(selector).forEach((meta) => {
          if (defaultTitles.has(meta.content) && meta.content !== title) meta.content = title;
        });
      }
      for (const selector of DESCRIPTION_SELECTORS) {
        document.querySelectorAll<HTMLMetaElement>(selector).forEach((meta) => {
          if (defaultDescriptions.has(meta.content) && meta.content !== description) meta.content = description;
        });
      }
    }

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, attributes: true, characterData: true });
    return () => observer.disconnect();
  }, [dictionary]);

  return null;
}
