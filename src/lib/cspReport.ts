/**
 * Turns a browser CSP violation report into one small, privacy-safe log
 * record — or `null` for anything that isn't a report we understand.
 *
 * Accepts both formats browsers send: the legacy `report-uri` body
 * (`{"csp-report": {...}}`, application/csp-report) and the Reporting API
 * (`[{type: "csp-violation", body: {...}}]`, application/reports+json).
 *
 * Logged: the directive, the blocked resource's *origin* only (or a keyword
 * such as "inline"/"eval"), the page's first path segment and the disposition.
 * Never logged: full URLs (paths carry note/wall/project ids and query
 * strings), the sample of offending code, the referrer, IPs or user agents.
 */
export interface CspViolationRecord {
  directive: string;
  blocked: string;
  page: string;
  disposition: string;
}

export const CSP_REPORT_MAX_BYTES = 8 * 1024;
export const CSP_REPORT_MAX_RECORDS = 5;

const KEYWORDS = new Set(["inline", "eval", "self", "data", "blob", "wasm-eval", "trusted-types-policy", "trusted-types-sink"]);

function clip(value: string, max = 64): string {
  return value.replace(/[^\x20-\x7e]/g, "?").slice(0, max);
}

export function blockedOrigin(raw: unknown): string {
  if (typeof raw !== "string" || raw === "") return "none";
  if (KEYWORDS.has(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "wss:" || url.protocol === "ws:") {
      return clip(url.origin);
    }
    return clip(url.protocol);
  } catch {
    return "other";
  }
}

export function pageSection(raw: unknown): string {
  if (typeof raw !== "string") return "unknown";
  try {
    const first = new URL(raw).pathname.split("/").filter(Boolean)[0];
    return first ? `/${clip(first, 32)}` : "/";
  } catch {
    return "unknown";
  }
}

function toRecord(body: Record<string, unknown>): CspViolationRecord | null {
  const directive = body["effective-directive"] ?? body["effectiveDirective"] ?? body["violated-directive"];
  if (typeof directive !== "string" || directive === "") return null;
  const disposition = body["disposition"];
  return {
    directive: clip(directive.split(" ")[0], 40),
    blocked: blockedOrigin(body["blocked-uri"] ?? body["blockedURL"]),
    page: pageSection(body["document-uri"] ?? body["documentURL"]),
    disposition: typeof disposition === "string" ? clip(disposition, 16) : "report",
  };
}

export function parseCspReport(text: string): CspViolationRecord[] {
  if (text.length === 0 || text.length > CSP_REPORT_MAX_BYTES) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const bodies: Record<string, unknown>[] = [];
  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      if (entry && typeof entry === "object" && (entry as { type?: unknown }).type === "csp-violation") {
        const body = (entry as { body?: unknown }).body;
        if (body && typeof body === "object") bodies.push(body as Record<string, unknown>);
      }
    }
  } else if (parsed && typeof parsed === "object") {
    const legacy = (parsed as { "csp-report"?: unknown })["csp-report"];
    if (legacy && typeof legacy === "object") bodies.push(legacy as Record<string, unknown>);
  }
  return bodies
    .slice(0, CSP_REPORT_MAX_RECORDS)
    .map(toRecord)
    .filter((record): record is CspViolationRecord => record !== null);
}
