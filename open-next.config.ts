import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// EPIC: Proper Cloudflare OpenNext Integration and Real Bundle Measurement.
// Minimal, default OpenNext-for-Cloudflare config — no incremental cache,
// queue, or tag-cache overrides. This is the starting point required to
// produce a real, measurable Worker bundle; storage-backed caching (KV/R2/D1)
// is a later, separate decision, not part of this measurement-only EPIC.
export default defineCloudflareConfig();
