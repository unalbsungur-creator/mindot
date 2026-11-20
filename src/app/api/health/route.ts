import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

/**
 * Uptime probe. Deliberately touches nothing: no database, no session, no KV,
 * no repository import — so a monitor polling it every few minutes can never
 * wake Neon. It answers "is the Worker up and which build is it", nothing
 * about the database (a separate question that costs a wake-up to ask).
 */
export function GET(): Response {
  let version = "dev";
  try {
    const metadata = (getCloudflareContext().env as { CF_VERSION_METADATA?: { id?: string } }).CF_VERSION_METADATA;
    if (metadata?.id) version = metadata.id;
  } catch {
    // Not running inside a Worker (next dev): keep "dev".
  }
  return Response.json({ status: "ok", version }, { headers: { "Cache-Control": "no-store" } });
}
