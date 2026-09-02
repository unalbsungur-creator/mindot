"use client";

import { useEffect } from "react";
import { StatePanel } from "@/components/ui/StatePanel";
import { useLocale } from "@/i18n/LocaleProvider";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const { dictionary } = useLocale();
    useEffect(() => { console.error("MINDOT route error", error); }, [error]);
    return <StatePanel title={dictionary.states.unexpectedTitle} body={dictionary.states.unexpectedBody} onRetry={reset} retryLabel={dictionary.states.retry} secondaryAction={{ label: dictionary.states.home, href: "/" }} />;
}
