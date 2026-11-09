import { MAX_ALERT_RECIPIENTS } from "../types";

/**
 * MN-01 moderation alerts — the pure recipient-list parser.
 *
 * Takes the raw configured value (the caller reads the environment; this
 * module never does) and either returns the deliverable addresses or one
 * fail-closed reason. Rules:
 *  - comma-separated; spaces/tabs around an entry are trimmed;
 *  - a blank entry (including a trailing comma) rejects the whole list;
 *  - any control character (CR/LF included) rejects the whole list — this
 *    is what keeps a value from smuggling extra mail headers;
 *  - each address must be a plain `local@domain` (dot-atom local part, LDH
 *    domain labels, ≤ 64 / ≤ 253 / ≤ 254 characters);
 *  - duplicates are folded case-insensitively, keeping the first spelling;
 *  - more than {@link MAX_ALERT_RECIPIENTS} unique addresses rejects the
 *    whole list — it is never silently truncated.
 * An error carries a reason and at most the entry's position, never the
 * value itself (it may be a real address sitting next to secrets in a log).
 */

/** Longest raw configured value accepted before any parsing (5 × 254 + separators fits easily). */
export const MAX_RECIPIENTS_INPUT_LENGTH = 2048;

const MAX_ADDRESS_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
const MAX_DOMAIN_LENGTH = 253;

const ATEXT = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+";
const LOCAL_PART = new RegExp(`^${ATEXT}(?:\\.${ATEXT})*$`);
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TOP_LEVEL_LABEL = /^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{1,59})$/;
// C0 controls, DEL and the C1 range.
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

export type RecipientParseError = "no-recipients" | "input-too-long" | "invalid-recipient" | "too-many-recipients";

export type ParsedAlertRecipients =
  | { ok: true; addresses: readonly string[] }
  | { ok: false; reason: RecipientParseError; index?: number };

/** True for a syntactically acceptable, already-trimmed address. */
export function isValidAlertRecipient(address: string): boolean {
  if (typeof address !== "string" || address.length === 0 || address.length > MAX_ADDRESS_LENGTH) return false;
  if (CONTROL_CHARACTER.test(address)) return false;

  const at = address.indexOf("@");
  if (at <= 0 || at !== address.lastIndexOf("@")) return false;
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (local.length > MAX_LOCAL_LENGTH || domain.length === 0 || domain.length > MAX_DOMAIN_LENGTH) return false;
  if (!LOCAL_PART.test(local)) return false;

  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((label) => DOMAIN_LABEL.test(label))) return false;
  return TOP_LEVEL_LABEL.test(labels[labels.length - 1]);
}

/**
 * The form an address is compared and (later) hashed in: case-folded as a
 * whole, so `Admin@Example.com` and `admin@example.com` are one recipient.
 * Delivery still uses the configured spelling.
 */
export function normalizeAlertRecipient(address: string): string {
  return address.toLowerCase();
}

export function parseAlertRecipients(raw: string | undefined): ParsedAlertRecipients {
  if (typeof raw !== "string" || raw.trim().length === 0) return { ok: false, reason: "no-recipients" };
  if (raw.length > MAX_RECIPIENTS_INPUT_LENGTH) return { ok: false, reason: "input-too-long" };

  const addresses: string[] = [];
  const seen = new Set<string>();
  const entries = raw.split(",");
  for (let index = 0; index < entries.length; index++) {
    // Only spaces and tabs are trimmed — never CR/LF, so a trailing line break
    // can't be "trimmed away" and must fail the control-character check below.
    const address = entries[index].replace(/^[ \t]+|[ \t]+$/g, "");
    if (CONTROL_CHARACTER.test(address)) return { ok: false, reason: "invalid-recipient", index };
    if (!isValidAlertRecipient(address)) return { ok: false, reason: "invalid-recipient", index };

    const key = normalizeAlertRecipient(address);
    if (seen.has(key)) continue;
    seen.add(key);
    addresses.push(address);
  }

  if (addresses.length > MAX_ALERT_RECIPIENTS) return { ok: false, reason: "too-many-recipients" };
  return { ok: true, addresses };
}
