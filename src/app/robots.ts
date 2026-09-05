import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: ["/", "/about", "/board", "/u/", "/privacy", "/terms", "/community-guidelines"],
            // "/me" (no trailing slash) is deliberate, not an inconsistency:
            // robots.txt disallow rules are literal-string prefix matches, so
            // "/me" already covers "/me", "/me/", "/me/archive", and
            // "/me/memories" — the same routes that independently set
            // `robots: { index: false, follow: false }` in src/app/me/layout.tsx.
            // This list is a courtesy to well-behaved crawlers, not the
            // access-control boundary — that stays server-side auth() checks.
            // "/notifications" (EPIC 023) — same courtesy-only shape as "/me"
            // above: it independently sets robots: {index:false} in its own
            // layout.tsx; the real boundary is auth() there, not this list.
            disallow: ["/admin/", "/api/", "/invite/", "/me", "/memory/", "/notifications", "/share/", "/write"],
        },
        sitemap: new URL("/sitemap.xml", getAppUrl()).toString(),
        host: getAppUrl().origin,
    };
}
