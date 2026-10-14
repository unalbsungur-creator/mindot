import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isCompletedShare, type ShareFileOutcome } from "./nativeFileShare";
import {
  FACEBOOK_DIALOG_FEATURES,
  facebookShareUrl,
  isTouchPrimaryDevice,
  socialShareRoute,
  type SocialPlatform,
} from "./socialShare";

const PLATFORMS: SocialPlatform[] = ["facebook", "instagram", "tiktok"];

describe("facebookShareUrl", () => {
  test("opens Facebook's web share dialog for the encoded page URL", () => {
    assert.equal(
      facebookShareUrl("https://mind-ot.com/share/abc?x=1&y=2"),
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fmind-ot.com%2Fshare%2Fabc%3Fx%3D1%26y%3D2"
    );
  });

  test("opens it without an opener or referrer", () => {
    const features = FACEBOOK_DIALOG_FEATURES.split(",");
    assert.ok(features.includes("noopener"));
    assert.ok(features.includes("noreferrer"));
  });
});

describe("isTouchPrimaryDevice", () => {
  test("true only when the hover-none, coarse-pointer query matches", () => {
    const queries: string[] = [];
    assert.equal(isTouchPrimaryDevice((query) => (queries.push(query), { matches: true })), true);
    assert.deepEqual(queries, ["(hover: none) and (pointer: coarse)"]);
    assert.equal(isTouchPrimaryDevice(() => ({ matches: false })), false);
  });

  test("false without matchMedia (server) or when it throws", () => {
    assert.equal(isTouchPrimaryDevice(undefined), false);
    assert.equal(
      isTouchPrimaryDevice(() => {
        throw new Error("unsupported");
      }),
      false
    );
  });
});

describe("socialShareRoute", () => {
  test("desktop (no share sheet): Facebook's web dialog, Instagram/TikTok download — no app assumed", () => {
    assert.equal(socialShareRoute("facebook", { nativeSheet: false }), "facebook-dialog");
    assert.equal(socialShareRoute("instagram", { nativeSheet: false }), "download");
    assert.equal(socialShareRoute("tiktok", { nativeSheet: false }), "download");
  });

  test("touch devices with file sharing keep the OS share sheet for every platform", () => {
    for (const platform of PLATFORMS) {
      assert.equal(socialShareRoute(platform, { nativeSheet: true }), "native-sheet", platform);
    }
  });

  test("only a completed share sheet can trigger the first-share reward — never the dialog or a download", () => {
    // The fallback routes produce no share outcome at all; of the sheet's
    // outcomes only "shared" counts (SocialShareActions calls onShared then).
    for (const platform of PLATFORMS) {
      assert.notEqual(socialShareRoute(platform, { nativeSheet: false }), "native-sheet", platform);
    }
    const outcomes: ShareFileOutcome[] = ["shared", "cancelled", "unsupported", "failed"];
    assert.deepEqual(outcomes.filter(isCompletedShare), ["shared"]);
  });
});
