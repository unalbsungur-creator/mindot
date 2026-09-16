"use client";

import { StatePanel } from "@/components/ui/StatePanel";
import { useLocale } from "@/i18n/LocaleProvider";
export default function Loading() {
  const { dictionary } = useLocale();
  return <StatePanel title={dictionary.states.loadingTitle} busy />;
}
