"use client";

import { useEffect } from "react";
import { logAppError } from "@/lib/errorLogging";

/**
 * EPIC 020: closes the one gap `app/error.tsx` cannot — an error thrown
 * by the root layout itself (or anything rendered inside it, e.g.
 * `SiteHeader`/`SiteFooter`/`LocaleProvider`) never reaches `error.tsx`,
 * since that boundary wraps everything *below* the root layout, not the
 * layout itself. This file replaces the entire document when that
 * happens, so per Next's documented requirement it must be fully
 * self-contained: no Tailwind (`globals.css` is not included here), no
 * `LocaleProvider`/`useLocale()` (the very thing that may have just
 * crashed), no other app import beyond the shared error logger. English
 * text only, deliberately — this is the one place in the app where the
 * normal "every user-facing string comes from the locale dictionary"
 * rule cannot apply, since the mechanism that resolves a locale is
 * exactly what may be broken.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logAppError(error, { source: "client-render", routePath: "__root_layout__" });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#faf8f4",
          color: "#1a2332",
        }}
      >
        <div style={{ maxWidth: "28rem", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem" }}>Something went wrong</h1>
          <p style={{ color: "#5b6472", lineHeight: 1.6 }}>
            MINDOT hit an unexpected error. Please try reloading the page.
          </p>
        </div>
      </body>
    </html>
  );
}
