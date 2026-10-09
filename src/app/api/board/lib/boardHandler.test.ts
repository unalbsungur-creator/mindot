import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveBoardViewer, type BoardViewerAuthDeps } from "./boardHandler";

function makeDeps(
  result: Awaited<ReturnType<BoardViewerAuthDeps["authenticateMobile"]>> = {
    ok: true,
    identity: { userId: "mobile-user" },
  },
): BoardViewerAuthDeps {
  return {
    async authenticateMobile() {
      return result;
    },
  };
}

describe("resolveBoardViewer", () => {
  it("uses the web session when no Authorization header is supplied", async () => {
    const result = await resolveBoardViewer(null, "web-user", makeDeps());

    assert.deepEqual(result, { ok: true, viewerId: "web-user" });
  });

  it("uses the authenticated mobile identity when a Bearer header is supplied", async () => {
    const result = await resolveBoardViewer("Bearer valid-token", "web-user", makeDeps());

    assert.deepEqual(result, { ok: true, viewerId: "mobile-user" });
  });

  it("does not fall back to the web session when mobile authentication fails", async () => {
    const result = await resolveBoardViewer(
      "Bearer invalid-token",
      "web-user",
      makeDeps({ ok: false, error: "unauthorized" }),
    );

    assert.deepEqual(result, {
      ok: false,
      status: 401,
      error: "unauthorized",
    });
  });

  it("returns 403 for a mobile admin account", async () => {
    const result = await resolveBoardViewer(
      "Bearer admin-token",
      null,
      makeDeps({ ok: false, error: "admin-account" }),
    );

    assert.deepEqual(result, {
      ok: false,
      status: 403,
      error: "admin-account",
    });
  });

  it("returns 503 when mobile authentication is unavailable", async () => {
    const result = await resolveBoardViewer(
      "Bearer token",
      null,
      makeDeps({ ok: false, error: "unavailable" }),
    );

    assert.deepEqual(result, {
      ok: false,
      status: 503,
      error: "unavailable",
    });
  });

  it("returns 401 when neither mobile credentials nor a web user are available", async () => {
    const result = await resolveBoardViewer(null, null, makeDeps());

    assert.deepEqual(result, {
      ok: false,
      status: 401,
      error: "unauthorized",
    });
  });
});
