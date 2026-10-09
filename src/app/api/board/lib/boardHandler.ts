type MobileAuthResult =
  | { ok: true; identity: { userId: string } }
  | { ok: false; error: "unauthorized" | "admin-account" | "unavailable" };

export interface BoardViewerAuthDeps {
  authenticateMobile: (
    authorizationHeader: string | null,
  ) => Promise<MobileAuthResult>;
}

export type BoardViewerAuthResult =
  | { ok: true; viewerId: string }
  | {
      ok: false;
      status: 401 | 403 | 503;
      error: "unauthorized" | "admin-account" | "unavailable";
    };

/**
 * Resolves the viewer for a personalized Board request.
 * A supplied Authorization header is always handled as mobile authentication:
 * invalid mobile credentials never fall back to a web session.
 */
export async function resolveBoardViewer(
  authorizationHeader: string | null,
  webUserId: string | null | undefined,
  deps: BoardViewerAuthDeps,
): Promise<BoardViewerAuthResult> {
  if (authorizationHeader !== null) {
    const result = await deps.authenticateMobile(authorizationHeader);

    if (!result.ok) {
      const status =
        result.error === "unauthorized"
          ? 401
          : result.error === "admin-account"
            ? 403
            : 503;

      return { ok: false, status, error: result.error };
    }

    return { ok: true, viewerId: result.identity.userId };
  }

  if (!webUserId) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  return { ok: true, viewerId: webUserId };
}
