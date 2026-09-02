"use client";

import { StatePanel } from "@/components/ui/StatePanel";
import { useLocale } from "@/i18n/LocaleProvider";

export default function NotFoundPage() {
    const { dictionary } = useLocale();
    return <StatePanel title={dictionary.states.notFoundTitle} body={dictionary.states.notFoundBody} action={{ label: dictionary.states.board, href: "/board" }} secondaryAction={{ label: dictionary.states.home, href: "/" }} />;
}
