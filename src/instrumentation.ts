import type { Instrumentation } from "next";
import { logAppError } from "@/lib/errorLogging";

/**
 * EPIC 020: the single, framework-native hook that catches every
 * *unexpected* server-side error — uncaught exceptions from Server
 * Components (render), Route Handlers (route), and Server Actions
 * (action) alike — with no per-file try/catch added anywhere else. This
 * is the real gap this EPIC closes: before this file existed, an
 * uncaught error in, say, `getTile()` or `generateMemoryPdf()` reached no
 * code of this project's own at all; Next.js still logged *something* to
 * the process's own stdout/stderr by default, but with no structured,
 * consistent shape and no single place to point an operator at.
 *
 * Deliberately minimal: no `register()` export (nothing needs to run at
 * server startup), no OpenTelemetry/`@vercel/otel`/third-party SDK — see
 * errorLogging.ts's doc comment for why a plain `console.error` call is
 * the right amount of infrastructure here.
 *
 * Only `error`, `request.method`, and `context.routePath`/`routeType` are
 * read — `request.path` (which can carry user-supplied query-string
 * values) and `request.headers` (which includes the `cookie` header) are
 * never touched, and no attempt is made to resolve a session inside this
 * hook. See errorLogging.ts for the full rationale.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  logAppError(error, {
    source: "server-request",
    routePath: context.routePath,
    routeType: context.routeType,
    method: request.method,
  });
};
