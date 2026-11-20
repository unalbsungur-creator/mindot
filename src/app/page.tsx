import { isDatabaseConfigured } from "@/lib/env";
import { getHomeData, type HomeData } from "./_home/homeData";
import { HomeHero } from "./_home/HomeHero";
import { MeaningStrip } from "./_home/MeaningStrip";

// EPIC: Ana Sayfa Dinamik Mesajları / Aktif Mesaj Sayacı — real database
// data, refreshed periodically rather than on every single request (the
// homepage doesn't need millisecond freshness, and this keeps the page
// effectively static/cached the rest of the time — see the Performans
// section of that EPIC). NOTE: this Worker has no ISR cache, so `revalidate`
// alone does not stop a database read per visit — the reads go through
// getHomeData's 5-minute KV cache instead (see src/lib/kvCache.ts).
export const revalidate = 60;

/**
 * EPIC: MINDOT Ana Sayfa — Tek Sayfalık Final Landing Page. Exactly two
 * sections — Header/Footer are rendered once, in the root layout, not
 * here. Fetches real data (hero's 4 notes, live active-message count)
 * from small, indexed, limited queries — never a full-table
 * fetch-and-sort-in-JS. The same `activeCount` also drives the hero's
 * compact 1,000,000-dot milestone readout (see HomeHero/PointsMilestone)
 * — one query, two displays, no separate section for it.
 *
 * EPIC: Make Database Dependency Safe for Cloudflare Build — this page
 * uses ISR (`export const revalidate` above), so it's prerendered at
 * `next build` time, not just at request time. `isDatabaseConfigured()`
 * is checked *before* either database call — when DATABASE_URL genuinely
 * isn't set yet (a fresh deployment target whose production database
 * hasn't been provisioned), the page renders with an honest empty/zero
 * state instead of the build crashing. `getDb()`/`requireRuntimeEnv`
 * themselves are unchanged: once a real DATABASE_URL is configured, this
 * same code path calls them exactly as before and a genuine query error
 * still surfaces normally, not swallowed.
 */
export default async function Home() {
  const { hero, activeCount }: HomeData = isDatabaseConfigured()
    ? await getHomeData()
    : { hero: { mode: "latest", notes: [], pinnedIds: [] }, activeCount: 0 };

  // MB-01: <main> is flex-1 and fills the viewport; without this wrapper the
  // two sections kept their own height and the canvas showed as an empty
  // band above the footer. The hero takes up the remaining height instead.
  return (
    <div data-fill-main="" className="flex flex-1 flex-col bg-navy">
      <HomeHero activeCount={activeCount} heroNotes={hero.notes} heroMode={hero.mode} pinnedIds={hero.pinnedIds} />
      <MeaningStrip />
    </div>
  );
}
