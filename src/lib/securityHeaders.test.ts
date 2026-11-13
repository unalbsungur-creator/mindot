import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blockedOrigin, CSP_REPORT_MAX_BYTES, pageSection, parseCspReport } from "./cspReport";
import { CONTENT_SECURITY_POLICY_REPORT_ONLY, CSP_REPORT_PATH, SECURITY_HEADERS } from "./securityHeaders";

function header(key: string): string | undefined {
  return SECURITY_HEADERS.find((h) => h.key === key)?.value;
}

describe("security headers", () => {
  it("sets the basic hardening headers", () => {
    assert.equal(header("X-Content-Type-Options"), "nosniff");
    assert.equal(header("X-Frame-Options"), "DENY");
    assert.equal(header("Referrer-Policy"), "strict-origin-when-cross-origin");
    for (const feature of ["camera=()", "microphone=()", "geolocation=()", "payment=()"]) {
      assert.ok(header("Permissions-Policy")?.includes(feature), feature);
    }
  });

  it("ships the CSP as Report-Only, never enforcing (yet)", () => {
    assert.equal(header("Content-Security-Policy"), undefined);
    assert.equal(header("Content-Security-Policy-Report-Only"), CONTENT_SECURITY_POLICY_REPORT_ONLY);
    assert.ok(CONTENT_SECURITY_POLICY_REPORT_ONLY.includes(`report-uri ${CSP_REPORT_PATH}`));
    assert.equal(header("Reporting-Endpoints"), `csp="${CSP_REPORT_PATH}"`);
  });

  it("allows exactly the third parties the site uses", () => {
    const csp = CONTENT_SECURITY_POLICY_REPORT_ONLY;
    assert.match(csp, /script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
    assert.match(csp, /frame-src https:\/\/challenges\.cloudflare\.com/);
    assert.match(csp, /img-src [^;]*https:\/\/\*\.googleusercontent\.com/);
    assert.match(csp, /form-action 'self' https:\/\/accounts\.google\.com https:\/\/appleid\.apple\.com/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
  });

  it("leaves HSTS to the Cloudflare edge", () => {
    assert.equal(header("Strict-Transport-Security"), undefined);
  });
});

describe("CSP report parsing", () => {
  it("reads a legacy report-uri body and keeps no full URLs", () => {
    const body = JSON.stringify({
      "csp-report": {
        "document-uri": "https://mind-ot.com/memory/1234-abcd?x=secret",
        "effective-directive": "img-src",
        "blocked-uri": "https://evil.example/pixel.gif?u=someone@example.com",
        disposition: "report",
        "script-sample": "alert(document.cookie)",
      },
    });
    assert.deepEqual(parseCspReport(body), [
      { directive: "img-src", blocked: "https://evil.example", page: "/memory", disposition: "report" },
    ]);
  });

  it("reads a Reporting API batch and ignores other report types", () => {
    const body = JSON.stringify([
      { type: "csp-violation", body: { documentURL: "https://mind-ot.com/", effectiveDirective: "script-src-elem", blockedURL: "inline", disposition: "report" } },
      { type: "deprecation", body: { id: "x" } },
    ]);
    assert.deepEqual(parseCspReport(body), [{ directive: "script-src-elem", blocked: "inline", page: "/", disposition: "report" }]);
  });

  it("drops junk, oversized and directive-less input", () => {
    assert.deepEqual(parseCspReport(""), []);
    assert.deepEqual(parseCspReport("not json"), []);
    assert.deepEqual(parseCspReport(JSON.stringify({ "csp-report": { "blocked-uri": "x" } })), []);
    assert.deepEqual(parseCspReport("x".repeat(CSP_REPORT_MAX_BYTES + 1)), []);
  });

  it("caps the records taken from one request", () => {
    const one = { type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://a.example/x", documentURL: "https://mind-ot.com/board" } };
    assert.equal(parseCspReport(JSON.stringify(Array(50).fill(one))).length, 5);
  });

  it("reduces values to origins / first path segments", () => {
    assert.equal(blockedOrigin("data"), "data");
    assert.equal(blockedOrigin("chrome-extension://abc/def.js"), "chrome-extension:");
    assert.equal(blockedOrigin(42), "none");
    assert.equal(pageSection("https://mind-ot.com/u/ABC123?from=2026"), "/u");
    assert.equal(pageSection("nonsense"), "unknown");
  });
});
