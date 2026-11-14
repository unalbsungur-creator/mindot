import { CSP_REPORT_MAX_BYTES, parseCspReport } from "@/lib/cspReport";

/**
 * Collects Content-Security-Policy-Report-Only violations (see
 * src/lib/securityHeaders.ts) into the Worker's own logs — free, no third
 * party. Each report becomes at most a few one-line `[csp]` records with no
 * personal data (lib/cspReport.ts decides what is kept). Read them with
 * `wrangler tail` / Workers Logs, filtered on "[csp]".
 *
 * Always answers 204 with no body, whatever arrives — it never tells a
 * sender whether its input was understood. Oversized bodies are dropped
 * unread past the cap. The route is public by nature (browsers send reports
 * without credentials); the Cloudflare rate-limit rule covers floods.
 */
export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared <= CSP_REPORT_MAX_BYTES) {
    let text = "";
    try {
      text = await request.text();
    } catch {
      text = "";
    }
    for (const record of parseCspReport(text)) {
      console.warn(`[csp] ${record.disposition} ${record.directive} blocked=${record.blocked} page=${record.page}`);
    }
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
