import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { invalidateKvCache, KV_MIN_TTL_SECONDS, readThroughKvCache, tileCacheKey, type CacheKv } from "./kvCache";

function memoryKv(initial: Record<string, string> = {}): CacheKv & { store: Map<string, string>; ttls: Map<string, number | undefined> } {
  const store = new Map(Object.entries(initial));
  const ttls = new Map<string, number | undefined>();
  return {
    store,
    ttls,
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value, options) {
      store.set(key, value);
      ttls.set(key, options?.expirationTtl);
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

describe("readThroughKvCache", () => {
  it("loads once, then answers from KV without calling the loader", async () => {
    const kv = memoryKv();
    let calls = 0;
    const load = async () => {
      calls += 1;
      return { n: calls };
    };
    assert.deepEqual(await readThroughKvCache({ kv, key: "k", ttlSeconds: 300, load }), { n: 1 });
    assert.deepEqual(await readThroughKvCache({ kv, key: "k", ttlSeconds: 300, load }), { n: 1 });
    assert.equal(calls, 1);
    assert.equal(kv.ttls.get("k"), 300);
  });

  it("never asks KV for less than its 60 second minimum", async () => {
    const kv = memoryKv();
    await readThroughKvCache({ kv, key: "k", ttlSeconds: 5, load: async () => 1 });
    assert.equal(kv.ttls.get("k"), KV_MIN_TTL_SECONDS);
  });

  it("falls through to the loader without a binding, on a malformed value and on KV errors", async () => {
    assert.equal(await readThroughKvCache({ kv: null, key: "k", ttlSeconds: 60, load: async () => "db" }), "db");
    const bad = memoryKv({ k: "{not json" });
    assert.equal(await readThroughKvCache({ kv: bad, key: "k", ttlSeconds: 60, load: async () => "db" }), "db");
    assert.equal(bad.store.get("k"), JSON.stringify("db"));
    const broken: CacheKv = {
      async get() {
        throw new Error("kv down");
      },
      async put() {
        throw new Error("kv down");
      },
      async delete() {
        throw new Error("kv down");
      },
    };
    assert.equal(await readThroughKvCache({ kv: broken, key: "k", ttlSeconds: 60, load: async () => "db" }), "db");
  });

  it("lets a loader error through (a database failure is not cached or swallowed)", async () => {
    const kv = memoryKv();
    await assert.rejects(readThroughKvCache({ kv, key: "k", ttlSeconds: 60, load: async () => Promise.reject(new Error("db")) }), /db/);
    assert.equal(kv.store.size, 0);
  });
});

describe("invalidateKvCache", () => {
  it("deletes the given keys and tolerates a missing binding or a failing delete", async () => {
    const kv = memoryKv({ a: "1", [tileCacheKey(2, -3)]: "2", keep: "3" });
    await invalidateKvCache(["a", tileCacheKey(2, -3)], kv);
    assert.deepEqual([...kv.store.keys()], ["keep"]);
    await invalidateKvCache(["a"], null);
    const failing: CacheKv = { ...kv, delete: async () => Promise.reject(new Error("x")) };
    await invalidateKvCache(["keep"], failing);
  });
});
