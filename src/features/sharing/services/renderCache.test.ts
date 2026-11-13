import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cachedImageRender, renderCacheKey, RENDER_NO_STORE_HEADER, SHARE_IMAGE_BROWSER_CACHE_CONTROL, type RenderCacheDeps } from "./renderCache";

function memoryCache() {
  const store = new Map<string, ArrayBuffer>();
  return {
    store,
    cache: {
      async match(key: Request) {
        const bytes = store.get(key.url);
        return bytes ? new Response(bytes.slice(0), { headers: { "Content-Type": "image/png" } }) : undefined;
      },
      async put(key: Request, response: Response) {
        store.set(key.url, await response.arrayBuffer());
      },
    },
  };
}

function png(label: string, init?: ResponseInit) {
  return new Response(new TextEncoder().encode(label), { status: 200, headers: { "Content-Type": "image/png" }, ...init });
}

function counter(label = "png") {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    render: async () => {
      calls++;
      return png(label);
    },
  };
}

const req = (headers?: Record<string, string>) => new Request("https://mind-ot.com/api/share/note/x/square", { headers });
const deps = (cache: RenderCacheDeps["cache"], deploymentId = "v1"): RenderCacheDeps => ({ cache, deploymentId });

describe("cachedImageRender", () => {
  it("renders once, then serves the same input from the edge cache", async () => {
    const { cache } = memoryCache();
    const r = counter();
    const first = await cachedImageRender(req(), "share-note", { content: "a" }, r.render, deps(cache));
    const second = await cachedImageRender(req(), "share-note", { content: "a" }, r.render, deps(cache));
    assert.equal(r.calls, 1);
    assert.equal(first.headers.get("X-Render-Cache"), "MISS");
    assert.equal(second.headers.get("X-Render-Cache"), "HIT");
    assert.equal(await second.text(), "png");
    assert.equal(second.headers.get("Cache-Control"), SHARE_IMAGE_BROWSER_CACHE_CONTROL);
    assert.equal(first.headers.get("ETag"), second.headers.get("ETag"));
  });

  it("re-renders when the card changes (edit / approved revision) — never a stale image", async () => {
    const { cache } = memoryCache();
    const r = counter();
    const before = await cachedImageRender(req(), "share-note", { content: "old" }, r.render, deps(cache));
    const after = await cachedImageRender(req(), "share-note", { content: "new" }, r.render, deps(cache));
    assert.equal(r.calls, 2);
    assert.equal(after.headers.get("X-Render-Cache"), "MISS");
    assert.notEqual(before.headers.get("ETag"), after.headers.get("ETag"));
  });

  it("re-renders after a new deploy", async () => {
    const { cache } = memoryCache();
    const r = counter();
    await cachedImageRender(req(), "share-note", { content: "a" }, r.render, deps(cache, "v1"));
    await cachedImageRender(req(), "share-note", { content: "a" }, r.render, deps(cache, "v2"));
    assert.equal(r.calls, 2);
  });

  it("answers a matching If-None-Match with 304 and no render", async () => {
    const r = counter();
    const first = await cachedImageRender(req(), "share-note", { content: "a" }, r.render, deps(null));
    const etag = first.headers.get("ETag")!;
    const revalidated = await cachedImageRender(req({ "If-None-Match": `W/${etag}` }), "share-note", { content: "a" }, r.render, deps(null));
    assert.equal(revalidated.status, 304);
    assert.equal(r.calls, 1);
  });

  it("never stores a non-200 result or a render marked no-store", async () => {
    const { cache, store } = memoryCache();
    const failed = await cachedImageRender(req(), "share-wall", { a: 1 }, async () => new Response("x", { status: 500 }), deps(cache));
    assert.equal(failed.status, 500);
    const fallback = await cachedImageRender(
      req(),
      "share-wall",
      { a: 2 },
      async () => png("fallback", { headers: { "Content-Type": "image/png", [RENDER_NO_STORE_HEADER]: "1" } }),
      deps(cache)
    );
    assert.equal(fallback.status, 200);
    assert.equal(store.size, 0);
  });

  it("works without an edge cache (dev, tests)", async () => {
    const r = counter();
    const response = await cachedImageRender(null, "og-share", { content: "a" }, r.render, deps(null));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "png");
  });

  it("keys on route, input and deployment", async () => {
    const base = await renderCacheKey("share-note", { a: 1 }, "v1");
    assert.equal(base, await renderCacheKey("share-note", { a: 1 }, "v1"));
    assert.notEqual(base, await renderCacheKey("og-share", { a: 1 }, "v1"));
    assert.notEqual(base, await renderCacheKey("share-note", { a: 2 }, "v1"));
    assert.notEqual(base, await renderCacheKey("share-note", { a: 1 }, "v2"));
  });
});
