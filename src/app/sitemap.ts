import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/env";

/**
 * Deliberately just the stable, always-public routes — not a database
 * crawl. `/board` is public but its content is a live, ever-changing tile
 * grid with no stable per-message URL to enumerate; `/u/[publicId]` walls
 * are public but per-user and unbounded, so listing them here would mean
 * an expensive, ever-growing query for marginal SEO value at this stage.
 * Search engines can still discover and index individual walls by
 * following links (the board, share cards, etc.) — this file just isn't
 * the mechanism for that. Revisit only if a compelling case for
 * enumerating public per-entity URLs emerges later.
 */
export default function sitemap(): MetadataRoute.Sitemap {
    const origin = getAppUrl();
    return ["/", "/about", "/board", "/privacy", "/terms", "/community-guidelines"].map((path) => ({
        url: new URL(path, origin).toString(),
        changeFrequency: path === "/board" ? "daily" : "monthly",
        priority: path === "/" ? 1 : path === "/board" ? 0.9 : path === "/about" ? 0.6 : 0.4,
    }));
}
