import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  downloadFile,
  fetchImageAsFile,
  hasUserActivation,
  isCompletedShare,
  offersDownloadAfterShare,
  shareFile,
  supportsFileShare,
} from "./nativeFileShare";

// Node has no Web Share API, so every browser global these helpers touch is
// a stand-in here. This checks the helpers' decisions only — whether a real
// browser shows its share sheet is not something these tests can observe.

const saved = new Map<string, PropertyDescriptor | undefined>();
function setGlobal(name: string, value: unknown) {
  if (!saved.has(name)) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
afterEach(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
  saved.clear();
});

const png = () => new File([new Uint8Array([1, 2, 3])], "card.png", { type: "image/png" });

describe("supportsFileShare", () => {
  test("false without navigator.share/canShare (most desktop browsers before file sharing)", () => {
    setGlobal("navigator", {});
    assert.equal(supportsFileShare(), false);
    setGlobal("navigator", { share: async () => {} });
    assert.equal(supportsFileShare(), false);
  });

  test("follows canShare for a real PNG file, and is false when canShare throws", () => {
    const probed: unknown[] = [];
    setGlobal("navigator", {
      share: async () => {},
      canShare: (data: { files?: File[] }) => (probed.push(data.files?.[0]?.type), true),
    });
    assert.equal(supportsFileShare(), true);
    assert.deepEqual(probed, ["image/png"]);
    setGlobal("navigator", { share: async () => {}, canShare: () => false });
    assert.equal(supportsFileShare(), false);
    setGlobal("navigator", {
      share: async () => {},
      canShare: () => {
        throw new TypeError("no");
      },
    });
    assert.equal(supportsFileShare(), false);
  });
});

describe("hasUserActivation", () => {
  test("reflects navigator.userActivation.isActive", () => {
    setGlobal("navigator", { userActivation: { isActive: true } });
    assert.equal(hasUserActivation(), true);
    setGlobal("navigator", { userActivation: { isActive: false } });
    assert.equal(hasUserActivation(), false);
  });

  test("true when the browser has no User Activation API (nothing to check)", () => {
    setGlobal("navigator", {});
    assert.equal(hasUserActivation(), true);
  });
});

describe("shareFile", () => {
  test("unsupported without the API, or when canShare refuses the file — never calls share", async () => {
    setGlobal("navigator", {});
    assert.equal(await shareFile(png()), "unsupported");
    let calls = 0;
    setGlobal("navigator", { canShare: () => false, share: async () => void calls++ });
    assert.equal(await shareFile(png()), "unsupported");
    assert.equal(calls, 0);
  });

  test("shares the file with only the non-empty title/text", async () => {
    const shared: unknown[] = [];
    setGlobal("navigator", { canShare: () => true, share: async (data: unknown) => void shared.push(data) });
    const file = png();
    assert.equal(await shareFile(file, { title: "MINDOT", text: "" }), "shared");
    assert.deepEqual(shared, [{ files: [file], title: "MINDOT" }]);
  });

  test("a dismissed sheet (AbortError) is cancelled; anything else, NotAllowedError included, is failed", async () => {
    const reject = (name: string) =>
      setGlobal("navigator", {
        canShare: () => true,
        share: async () => {
          throw Object.assign(new Error(name), { name });
        },
      });
    reject("AbortError");
    assert.equal(await shareFile(png()), "cancelled");
    // PdfDownloadButton relies on "failed" here to offer its second "Save PDF" tap.
    reject("NotAllowedError");
    assert.equal(await shareFile(png()), "failed");
  });

  test("in development only, logs a rejection's name and message — never the file — keeping the outcome", async (t) => {
    const warned: unknown[][] = [];
    t.mock.method(console, "warn", (...args: unknown[]) => void warned.push(args));
    // NODE_ENV is typed read-only; the test still swaps it and restores it below.
    const env = process.env as Record<string, string | undefined>;
    const nodeEnv = env.NODE_ENV;
    setGlobal("navigator", {
      canShare: () => true,
      share: async () => {
        throw Object.assign(new Error("Share failed"), { name: "AbortError" });
      },
    });
    try {
      env.NODE_ENV = "production";
      assert.equal(await shareFile(png()), "cancelled");
      assert.equal(warned.length, 0);

      env.NODE_ENV = "development";
      assert.equal(await shareFile(png()), "cancelled");
      assert.deepEqual(warned, [["[share] navigator.share rejected:", "AbortError", "Share failed"]]);

      setGlobal("navigator", { canShare: () => true, share: async () => {} });
      assert.equal(await shareFile(png()), "shared");
      assert.equal(warned.length, 1, "nothing logged for a completed share");
    } finally {
      if (nodeEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = nodeEnv;
    }
  });
});

describe("fetchImageAsFile", () => {
  test("wraps an image response as a PNG File with the given name", async () => {
    setGlobal("fetch", async () => new Response(new Uint8Array([9, 9]), { headers: { "content-type": "image/png" } }));
    const file = await fetchImageAsFile("/api/share/note/x/square?mode=note_only", "mindot-note-square.png");
    assert.ok(file);
    assert.equal(file.name, "mindot-note-square.png");
    assert.equal(file.type, "image/png");
    assert.equal(file.size, 2);
  });

  test("null for a non-2xx response or a non-image body", async () => {
    setGlobal("fetch", async () => new Response("{}", { status: 404, headers: { "content-type": "application/json" } }));
    assert.equal(await fetchImageAsFile("/x", "a.png"), null);
    setGlobal("fetch", async () => new Response("<html>", { headers: { "content-type": "text/html" } }));
    assert.equal(await fetchImageAsFile("/x", "a.png"), null);
  });
});

describe("downloadFile", () => {
  test("clicks a temporary download link for the file, removes it, and revokes the URL later", () => {
    const events: string[] = [];
    const link = {
      href: "",
      download: "",
      rel: "",
      style: { display: "" },
      click: () => events.push(`click ${link.href} ${link.download}`),
      remove: () => events.push("remove"),
    };
    setGlobal("document", {
      createElement: (tag: string) => (events.push(`create ${tag}`), link),
      body: { appendChild: () => events.push("append") },
    });
    const revoked: string[] = [];
    const { createObjectURL, revokeObjectURL } = URL;
    URL.createObjectURL = () => "blob:test";
    URL.revokeObjectURL = (url: string) => void revoked.push(url);
    let scheduled: (() => void) | null = null;
    setGlobal("window", { setTimeout: (fn: () => void) => ((scheduled = fn), 1) });

    try {
      downloadFile(png());
      assert.deepEqual(events, ["create a", "append", "click blob:test card.png", "remove"]);
      assert.deepEqual(revoked, [], "not revoked synchronously");
      scheduled!();
      assert.deepEqual(revoked, ["blob:test"]);
    } finally {
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
    }
  });
});

describe("offersDownloadAfterShare", () => {
  test("only a sheet that ended without a share offers the download — never alongside the reward", () => {
    assert.equal(offersDownloadAfterShare("cancelled"), true);
    for (const outcome of ["shared", "unsupported", "failed"] as const) {
      assert.equal(offersDownloadAfterShare(outcome), false, outcome);
    }
    for (const outcome of ["shared", "cancelled", "unsupported", "failed"] as const) {
      assert.ok(!(offersDownloadAfterShare(outcome) && isCompletedShare(outcome)), outcome);
    }
  });
});

describe("isCompletedShare", () => {
  test("only a share sheet that resolved counts — the first-share reward's trigger", () => {
    assert.equal(isCompletedShare("shared"), true);
    for (const outcome of ["cancelled", "unsupported", "failed"] as const) {
      assert.equal(isCompletedShare(outcome), false, outcome);
    }
  });
});
