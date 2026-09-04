"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { StatePanel } from "@/components/ui/StatePanel";
import { useLocale } from "@/i18n/LocaleProvider";
import { logAppError } from "@/lib/errorLogging";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const { dictionary } = useLocale();
    const pathname = usePathname();
    // EPIC 020: same shared logger `instrumentation.ts`'s onRequestError
    // uses for server-side errors — this is the one client-side error
    // boundary in the app, a disjoint domain from that server hook (this
    // fires only for a post-hydration render error the server never saw),
    // so the two never double-log the same error.
    useEffect(() => { logAppError(error, { source: "client-render", routePath: pathname ?? undefined }); }, [error, pathname]);
    return <StatePanel title={dictionary.states.unexpectedTitle} body={dictionary.states.unexpectedBody} onRetry={reset} retryLabel={dictionary.states.retry} secondaryAction={{ label: dictionary.states.home, href: "/" }} />;
}
