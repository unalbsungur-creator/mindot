/**
 * Security review 2026-11-13 (Aşama 2a/4): the response headers every route
 * gets, applied once in next.config.ts `headers()` (OpenNext serves them on
 * Cloudflare too). Kept here, not inline in the config, so the exact values
 * are unit-tested (securityHeaders.test.ts).
 *
 * HSTS is deliberately NOT here: it is set at the Cloudflare edge (SSL/TLS →
 * Edge Certificates), where its max-age is raised step by step.
 *
 * The CSP is **Report-Only** for now — it never blocks anything; violations
 * are POSTed to /api/csp-report (app/api/csp-report/route.ts). Moving to an
 * enforcing `Content-Security-Policy` is a later, separate step, once the
 * reports are clean. The sources are exactly what the site loads today:
 * - scripts: our own bundles + Next's inline bootstrap (the ISR homepage
 *   can't carry a per-request nonce, hence 'unsafe-inline' for now) and
 *   Cloudflare Turnstile on /admin/login (script + iframe);
 * - images: our own files, data:/blob: (downloads, share previews) and
 *   Google profile photos (plain <img> from *.googleusercontent.com);
 * - fonts: next/font, self-hosted;
 * - form-action: our Server Actions redirect to Google / Apple sign-in
 *   (Chrome checks form-action on the redirect too).
 */

export const CSP_REPORT_PATH = "/api/csp-report";

export const CONTENT_SECURITY_POLICY_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://challenges.cloudflare.com",
  "form-action 'self' https://accounts.google.com https://appleid.apple.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
  `report-uri ${CSP_REPORT_PATH}`,
  "report-to csp",
].join("; ");

export const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "serial=()",
  "bluetooth=()",
  "midi=()",
  "accelerometer=()",
  "gyroscope=()",
  "magnetometer=()",
  "browsing-topics=()",
].join(", ");

export const SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  { key: "Reporting-Endpoints", value: `csp="${CSP_REPORT_PATH}"` },
  { key: "Content-Security-Policy-Report-Only", value: CONTENT_SECURITY_POLICY_REPORT_ONLY },
];
