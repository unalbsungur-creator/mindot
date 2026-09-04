/**
 * EPIC 020: the one place an *unexpected* application error is written to
 * the server/browser console — used by `instrumentation.ts`'s
 * `onRequestError` (every uncaught Server Component/Route Handler/Server
 * Action error, automatically, with no per-route wiring) and by
 * `app/error.tsx`/`app/global-error.tsx`'s existing client boundaries.
 * Those two call sites cover disjoint error domains (server request
 * lifecycle vs. post-hydration client rendering), so using one shared
 * function here does not create duplicate log lines for the same error.
 *
 * This intentionally stays a `console.error` call, not a new logging
 * framework or third-party error-tracking service: this app's real
 * operator-visible log sink today is the process's own stdout/stderr
 * (the local dev terminal, or the hosting platform's log viewer for
 * whichever target — Node.js `next start` or the Cloudflare Workers
 * runtime via OpenNext — actually runs it), and `console.error` is what
 * every one of those already captures with no extra setup. Emitting one
 * structured JSON line per error is the smallest change that turns "an
 * error happened somewhere" into "an error happened in this route, of
 * this type, at this time" without adding an external dependency.
 *
 * Deliberately does NOT:
 * - accept or serialize the raw `Error`/`unknown` object via `JSON.stringify`
 *   or object-spread. Only `name`, `message`, and `stack` are read off it
 *   explicitly. This matters: the `postgres` driver's own error objects
 *   carry a `detail` property that can embed the literal offending column
 *   value (e.g. an email address, from a unique-constraint violation) —
 *   picking fields explicitly, rather than logging the error object
 *   itself, is what keeps that value out of the log.
 * - log request headers, cookies, query strings, request/response bodies,
 *   or any resolved session/user identity. `onRequestError`'s `request`
 *   parameter exposes raw headers (including `cookie`); this module never
 *   reads that parameter at all — see `instrumentation.ts`.
 * - attempt to resolve the current session/authenticated user id. Doing so
 *   from inside `onRequestError` would mean calling `auth()` (which reads
 *   request-scoped cookies) from an execution context Next.js does not
 *   document as supporting it — risking a second, harder-to-diagnose
 *   error thrown from inside the error handler itself. Not worth it for a
 *   pre-launch app with no real user-facing incident history yet.
 * - generate or thread a request correlation id. There is exactly one log
 *   line per error here (not a paired "request start" + "request end"
 *   line), and this is a single-process app with no downstream service to
 *   correlate against — a generated id would have nothing else to link to.
 */

export type AppErrorSource = "server-request" | "client-render";

export interface AppErrorContext {
  /** Which side caught this — see the module doc comment for why these never overlap. */
  source: AppErrorSource;
  /**
   * The route's file-system pattern (e.g. "/admin/reports", "/api/board")
   * — never a raw request URL/query string, which could carry
   * user-supplied values.
   */
  routePath?: string;
  /** "render" | "route" | "action" | "proxy" from Next's own `onRequestError` context, or "client" for a browser-side boundary. */
  routeType?: string;
  /** HTTP method, server-side only. */
  method?: string;
}

function digestOf(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "digest" in error
    ? String((error as { digest?: unknown }).digest)
    : undefined;
}

/**
 * Logs one unexpected error as a single structured JSON line. Never
 * throws itself — a broken error-reporting path must not become a second
 * error on top of the first.
 */
export function logAppError(error: unknown, context: AppErrorContext): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(
      JSON.stringify({
        level: "error",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        source: context.source,
        routePath: context.routePath,
        routeType: context.routeType,
        method: context.method,
        errorName: err.name,
        errorMessage: err.message,
        digest: digestOf(error),
        // Stack traces never reach a client bundle response body in
        // production (see error.tsx's own doc comment / Next's
        // documented server-component message redaction) — logging the
        // full stack here is server/operator-only visibility in both
        // cases, not a new exposure.
        stack: err.stack,
      })
    );
  } catch {
    // Never let a logging failure mask the original error.
  }
}
