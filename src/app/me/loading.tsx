"use client";

import { StatePanel } from "@/components/ui/StatePanel";
import { useLocale } from "@/i18n/LocaleProvider";

/**
 * MB-01: a route-level loading state only where the page really waits on
 * data. There is deliberately no root app/loading.tsx — it made every page
 * (/, /about, /terms…) stream behind this fallback, so their content was not
 * in the server HTML.
 */
export default function Loading() {
  const { dictionary } = useLocale();
  return <StatePanel title={dictionary.states.loadingTitle} busy />;
}
