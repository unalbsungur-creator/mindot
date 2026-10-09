import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { User } from "@/features/users/types";
import { handleMobileMe, type MeHandlerDeps } from "./meHandler";

const USER_ID = "user-123";

function makeUser() {
  return {
    id: USER_ID,
    email: "person@example.com",
    name: "Test User",
    image: "https://example.com/avatar.png",
    publicId: "public-123",
    publicWallEnabled: true,
    publicWallDescription: "Hello",
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    role: "admin",
    statusReason: "internal reason",
    statusChangedAt: new Date("2026-02-01T00:00:00.000Z"),
    statusChangedBy: "admin-456",
  } as unknown as User;
}

function makeDeps(
  overrides: Partial<MeHandlerDeps> = {},
): MeHandlerDeps {
  return {
    async authenticate() {
      return {
        ok: true,
        identity: { userId: USER_ID, status: "active" },
      };
    },
    async getUserById() {
      return makeUser();
    },
    ...overrides,
  };
}

describe("handleMobileMe", () => {
  it("returns only the approved profile fields", async () => {
    const result = await handleMobileMe("Bearer token", makeDeps());

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      ok: true,
      user: {
        id: USER_ID,
        email: "person@example.com",
        name: "Test User",
        image: "https://example.com/avatar.png",
        publicId: "public-123",
        publicWallEnabled: true,
        publicWallDescription: "Hello",
        status: "active",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    if (result.body.ok) {
      assert.equal("role" in result.body.user, false);
      assert.equal("statusReason" in result.body.user, false);
      assert.equal("statusChangedAt" in result.body.user, false);
      assert.equal("statusChangedBy" in result.body.user, false);
    }
  });

  it("returns 401 when authentication fails and does not load the user", async () => {
    let loaded = false;
    const result = await handleMobileMe(
      null,
      makeDeps({
        async authenticate() {
          return { ok: false, error: "unauthorized" };
        },
        async getUserById() {
          loaded = true;
          return makeUser();
        },
      }),
    );

    assert.deepEqual(result, {
      status: 401,
      body: { ok: false, error: "unauthorized" },
    });
    assert.equal(loaded, false);
  });

  it("returns 403 for an admin account", async () => {
    const result = await handleMobileMe(
      "Bearer token",
      makeDeps({
        async authenticate() {
          return { ok: false, error: "admin-account" };
        },
      }),
    );

    assert.deepEqual(result, {
      status: 403,
      body: { ok: false, error: "admin-account" },
    });
  });

  it("returns 503 when authentication is unavailable", async () => {
    const result = await handleMobileMe(
      "Bearer token",
      makeDeps({
        async authenticate() {
          return { ok: false, error: "unavailable" };
        },
      }),
    );

    assert.deepEqual(result, {
      status: 503,
      body: { ok: false, error: "unavailable" },
    });
  });

  it("returns 401 when the authenticated user no longer exists", async () => {
    const result = await handleMobileMe(
      "Bearer token",
      makeDeps({
        async getUserById() {
          return null;
        },
      }),
    );

    assert.deepEqual(result, {
      status: 401,
      body: { ok: false, error: "unauthorized" },
    });
  });

  it("returns 503 when loading the user throws", async () => {
    const result = await handleMobileMe(
      "Bearer token",
      makeDeps({
        async getUserById() {
          throw new Error("database unavailable");
        },
      }),
    );

    assert.deepEqual(result, {
      status: 503,
      body: { ok: false, error: "unavailable" },
    });
  });
});
