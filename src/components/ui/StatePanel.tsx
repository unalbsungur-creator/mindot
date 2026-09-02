import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";

interface StatePanelProps {
    title: string;
    body?: string;
    action?: { label: string; href: string };
    secondaryAction?: { label: string; href: string };
    onRetry?: () => void;
    retryLabel?: string;
    busy?: boolean;
}

/** Shared quiet state treatment for loading, missing, and error surfaces. */
export function StatePanel({ title, body, action, secondaryAction, onRetry, retryLabel, busy }: StatePanelProps) {
    return (
        <div role={busy ? "status" : undefined} aria-live={busy ? "polite" : undefined} className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-16 text-center">
            <BrandMark className={busy ? "h-9 animate-pulse" : "h-9"} />
            <h1 className="font-display text-2xl font-medium text-navy">{title}</h1>
            {body && <p className="text-sm leading-relaxed text-ink-soft">{body}</p>}
            <div className="flex flex-wrap justify-center gap-3 pt-2">
                {onRetry && <button type="button" onClick={onRetry} className="min-h-11 rounded-pill bg-orange px-5 text-sm font-medium text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy">{retryLabel}</button>}
                {action && <Link href={action.href} className="inline-flex min-h-11 items-center rounded-pill bg-orange px-5 text-sm font-medium text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy">{action.label}</Link>}
                {secondaryAction && <Link href={secondaryAction.href} className="inline-flex min-h-11 items-center rounded-pill border border-border px-5 text-sm font-medium text-ink-soft hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">{secondaryAction.label}</Link>}
            </div>
        </div>
    );
}
