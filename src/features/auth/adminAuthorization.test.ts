import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCurrentAdmin, resolveCurrentAdmin, type AdminAuthorizationState } from "./adminAuthorization";

const admin = { id: "admin-1", role: "admin" as const, name: "Admin" };
const activeAdmin: AdminAuthorizationState = { role: "admin", status: "active", deleted: false };

function loader(state: AdminAuthorizationState | null) {
  const calls: string[] = [];
  return {
    calls,
    load: async (id: string) => {
      calls.push(id);
      return state;
    },
  };
}

describe("isCurrentAdmin", () => {
  it("accepts only an active, non-deleted admin row", () => {
    assert.equal(isCurrentAdmin(activeAdmin), true);
    assert.equal(isCurrentAdmin({ ...activeAdmin, role: "user" }), false);
    assert.equal(isCurrentAdmin({ ...activeAdmin, status: "suspended" }), false);
    assert.equal(isCurrentAdmin({ ...activeAdmin, deleted: true }), false);
    assert.equal(isCurrentAdmin(null), false);
  });
});

describe("resolveCurrentAdmin", () => {
  it("returns the session user when the current row is still an active admin", async () => {
    const l = loader(activeAdmin);
    assert.equal(await resolveCurrentAdmin(admin, l.load), admin);
    assert.deepEqual(l.calls, ["admin-1"]);
  });

  it("denies an admin session whose row was demoted to user (no new sign-in needed)", async () => {
    assert.equal(await resolveCurrentAdmin(admin, loader({ ...activeAdmin, role: "user" }).load), null);
  });

  it("denies an admin session whose account was suspended", async () => {
    assert.equal(await resolveCurrentAdmin(admin, loader({ ...activeAdmin, status: "suspended" }).load), null);
  });

  it("denies an admin session whose account no longer exists or is a tombstone", async () => {
    assert.equal(await resolveCurrentAdmin(admin, loader(null).load), null);
    assert.equal(await resolveCurrentAdmin(admin, loader({ ...activeAdmin, deleted: true }).load), null);
  });

  it("never queries for a non-admin or missing session", async () => {
    const l = loader(activeAdmin);
    assert.equal(await resolveCurrentAdmin({ id: "u-1", role: "user" }, l.load), null);
    assert.equal(await resolveCurrentAdmin(null, l.load), null);
    assert.equal(await resolveCurrentAdmin({ role: "admin" }, l.load), null);
    assert.deepEqual(l.calls, []);
  });

  it("fails closed when the lookup throws", async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const result = await resolveCurrentAdmin(admin, async () => {
        throw new Error("db down");
      });
      assert.equal(result, null);
    } finally {
      console.error = original;
    }
  });
});
