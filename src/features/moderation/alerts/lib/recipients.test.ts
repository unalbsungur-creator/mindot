import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_ALERT_RECIPIENTS } from "../types";
import {
  MAX_RECIPIENTS_INPUT_LENGTH,
  isValidAlertRecipient,
  normalizeAlertRecipient,
  parseAlertRecipients,
} from "./recipients";

/** An address of exactly `length` characters with a 64-character local part. */
function addressOfLength(length: number): string {
  const local = "l".repeat(64);
  // Characters left for the domain labels before ".com", filled with ≤ 63-char labels joined by dots.
  let body = length - local.length - 1 - ".com".length;
  const labels: string[] = [];
  while (body > 0) {
    // Leave at least 2 characters (a dot and a 1-char label) whenever this can't be the last label.
    const size = body <= 63 ? body : Math.min(63, body - 2);
    labels.push("d".repeat(size));
    body -= size;
    if (body > 0) body -= 1; // the separating dot
  }
  return `${local}@${labels.join(".")}.com`;
}

describe("parseAlertRecipients — accepted lists", () => {
  it("parses one address", () => {
    assert.deepEqual(parseAlertRecipients("admin@mind-ot.com"), { ok: true, addresses: ["admin@mind-ot.com"] });
  });

  it("splits on commas and trims spaces and tabs around entries", () => {
    assert.deepEqual(parseAlertRecipients(" a@example.com ,\tb@example.org\t"), {
      ok: true,
      addresses: ["a@example.com", "b@example.org"],
    });
  });

  it("folds duplicates case-insensitively, keeping the first spelling and order", () => {
    assert.deepEqual(parseAlertRecipients("Ops.Team@Example.com, b@example.com, ops.team@example.COM"), {
      ok: true,
      addresses: ["Ops.Team@Example.com", "b@example.com"],
    });
  });

  it("accepts common real-world shapes", () => {
    for (const address of [
      "first.last+tag@sub.example.co.uk",
      "o'brien@example.ie",
      "x_y-z@example-domain.com",
      "user@example.xn--p1ai",
      "1234@example.museum",
    ]) {
      assert.equal(isValidAlertRecipient(address), true, address);
    }
  });

  it("accepts a 64-character local part and a 254-character address", () => {
    const longest = addressOfLength(254);
    assert.equal(longest.length, 254);
    assert.equal(isValidAlertRecipient(longest), true);
  });
});

describe("parseAlertRecipients — fail closed", () => {
  it("treats a missing or blank value as no recipients", () => {
    for (const raw of [undefined, "", "   ", "\t"]) {
      assert.deepEqual(parseAlertRecipients(raw), { ok: false, reason: "no-recipients" });
    }
  });

  it("rejects a blank entry anywhere, including a trailing comma", () => {
    assert.deepEqual(parseAlertRecipients("a@example.com,,b@example.com"), { ok: false, reason: "invalid-recipient", index: 1 });
    assert.deepEqual(parseAlertRecipients("a@example.com,"), { ok: false, reason: "invalid-recipient", index: 1 });
    assert.deepEqual(parseAlertRecipients(", a@example.com"), { ok: false, reason: "invalid-recipient", index: 0 });
  });

  const invalid = [
    "plainaddress",
    "a@b",
    "@example.com",
    "a@",
    "a@@example.com",
    "a@b@example.com",
    "a b@example.com",
    "<a@example.com>",
    "Name <a@example.com>",
    '"a"@example.com',
    "a..b@example.com",
    ".a@example.com",
    "a.@example.com",
    "a@-example.com",
    "a@example-.com",
    "a@example..com",
    "a@example.c",
    "a@example.123",
    "a@exa_mple.com",
    "a;b@example.com",
    "a@example.com;b@example.com",
    "a(b)@example.com",
    "a\\b@example.com",
    "ü@example.com",
    "a@exämple.com",
    `${"l".repeat(65)}@example.com`,
    addressOfLength(255),
  ];
  for (const address of invalid) {
    it(`rejects ${JSON.stringify(address.length > 40 ? `${address.slice(0, 20)}…(${address.length})` : address)}`, () => {
      const result = parseAlertRecipients(`ok@example.com, ${address}`);
      assert.deepEqual(result, { ok: false, reason: "invalid-recipient", index: 1 });
    });
  }

  it("rejects CR/LF header injection, even when it would trim away", () => {
    for (const raw of [
      "a@example.com\r\nBcc: attacker@example.com",
      "a@example.com\r\n",
      "a@example.com\n",
      "\na@example.com",
      "a@example.com\u0000",
      "a@exam\tple.com",
      "a@example.com\u0085",
    ]) {
      assert.deepEqual(parseAlertRecipients(raw), { ok: false, reason: "invalid-recipient", index: 0 }, JSON.stringify(raw));
    }
  });

  it("reports the failing entry's position but never its value", () => {
    const secretish = "leaked.person@private-domain.example";
    const result = parseAlertRecipients(`ok@example.com, ${secretish}\r\nBcc: x@y.com`);
    assert.deepEqual(result, { ok: false, reason: "invalid-recipient", index: 1 });
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes("leaked"));
    assert.ok(!serialized.includes("@"));
  });

  it(`allows exactly ${MAX_ALERT_RECIPIENTS} unique recipients and refuses one more (never truncates)`, () => {
    const five = Array.from({ length: MAX_ALERT_RECIPIENTS }, (_, i) => `admin${i}@example.com`);
    assert.deepEqual(parseAlertRecipients(five.join(",")), { ok: true, addresses: five });
    assert.deepEqual(parseAlertRecipients([...five, "admin5@example.com"].join(",")), {
      ok: false,
      reason: "too-many-recipients",
    });
  });

  it("counts recipients after case-insensitive deduplication", () => {
    const five = Array.from({ length: MAX_ALERT_RECIPIENTS }, (_, i) => `admin${i}@example.com`);
    const withDuplicate = [...five, "ADMIN0@EXAMPLE.COM"];
    assert.deepEqual(parseAlertRecipients(withDuplicate.join(",")), { ok: true, addresses: five });
  });

  it("refuses an oversized raw value before parsing it", () => {
    const raw = `a@example.com,${" ".repeat(MAX_RECIPIENTS_INPUT_LENGTH)}`;
    assert.deepEqual(parseAlertRecipients(raw), { ok: false, reason: "input-too-long" });
  });

  it("refuses non-string input", () => {
    assert.deepEqual(parseAlertRecipients(42 as unknown as string), { ok: false, reason: "no-recipients" });
    assert.equal(isValidAlertRecipient(undefined as unknown as string), false);
  });
});

describe("normalizeAlertRecipient", () => {
  it("case-folds the whole address (the form that is later hashed)", () => {
    assert.equal(normalizeAlertRecipient("Ops.Team@Example.COM"), "ops.team@example.com");
  });
});
