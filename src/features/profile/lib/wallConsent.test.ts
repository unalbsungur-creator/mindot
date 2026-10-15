import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPublicWallEligible, PUBLIC_WALL_CONSENT_VERSION, wallVisibilityState } from "./wallConsent";

describe("public wall consent rule", () => {
  it("opens a wall only when it is on and consented to under the current version", () => {
    assert.equal(isPublicWallEligible({ publicWallEnabled: true, publicWallConsentVersion: PUBLIC_WALL_CONSENT_VERSION }), true);
  });

  it("keeps a wall closed without consent, under an older version, or turned off", () => {
    for (const publicWallConsentVersion of [null, "", "0.9", `${PUBLIC_WALL_CONSENT_VERSION}.0`, " 1.0"]) {
      assert.equal(isPublicWallEligible({ publicWallEnabled: true, publicWallConsentVersion }), false, String(publicWallConsentVersion));
    }
    assert.equal(isPublicWallEligible({ publicWallEnabled: false, publicWallConsentVersion: PUBLIC_WALL_CONSENT_VERSION }), false);
    assert.equal(isPublicWallEligible({ publicWallEnabled: false, publicWallConsentVersion: null }), false);
  });

  it("tells the owner which of the three states the wall is in", () => {
    assert.equal(wallVisibilityState({ publicWallEnabled: true, publicWallConsentVersion: PUBLIC_WALL_CONSENT_VERSION }), "public");
    assert.equal(wallVisibilityState({ publicWallEnabled: true, publicWallConsentVersion: null }), "consent-required");
    assert.equal(wallVisibilityState({ publicWallEnabled: true, publicWallConsentVersion: "0.9" }), "consent-required");
    assert.equal(wallVisibilityState({ publicWallEnabled: false, publicWallConsentVersion: PUBLIC_WALL_CONSENT_VERSION }), "off");
    assert.equal(wallVisibilityState({ publicWallEnabled: false, publicWallConsentVersion: null }), "off");
  });
});
