import { SUPPORT_REPLY_TO } from "@/features/email/addresses";
import { resolveAppEnvironment, type AppEnvironment } from "@/lib/appEnvironment";
import { PRODUCTION_SITE_URL, STAGING_SITE_URL } from "@/lib/siteConfig";
import { ADMIN_MODERATION_PATH } from "./lib/alertEmailTemplate";
import { hashAlertRecipient, isUsableHashKey } from "./lib/addressHash";
import { parseAlertRecipients } from "./lib/recipients";
import type { AddressHash, AlertConfigState, AlertDisabledReason } from "./types";

/**
 * MN-01: the alert configuration, read from the environment and failing
 * closed. Alerts are OFF unless every one of these holds:
 *
 * - MODERATION_ALERTS_ENABLED is exactly "true" (the safe default is off);
 * - MODERATION_ALERT_RECIPIENTS parses: 1–5 plain addresses (lib/recipients.ts);
 * - MODERATION_ALERT_HASH_KEY is at least 32 bytes (the HMAC key for the
 *   stored recipient identity — lib/addressHash.ts);
 * - the existing email provider is Resend with its key
 *   (EMAIL_PROVIDER=resend, RESEND_API_KEY — the invitation emails' setup).
 *
 * MODERATION_ALERT_FROM optionally overrides the sender (default below);
 * EMAIL_FROM, the invitation emails' sender, is never used or changed here.
 *
 * Addresses only ever live in memory, in `addresses` (hash → configured
 * spelling, for delivery). Nothing here logs or returns a configured value
 * in an error.
 */

export const DEFAULT_ALERT_FROM = "MINDOT Bildirim <bildirim@mind-ot.com>";
export const ALERT_REPLY_TO = SUPPORT_REPLY_TO;

export type AlertEnv = Readonly<Record<string, string | undefined>>;

export interface ModerationAlertRuntime {
  state: AlertConfigState;
  environment: AppEnvironment;
  /** Recipient hash → configured address. Empty whenever alerts are disabled. */
  addresses: ReadonlyMap<AddressHash, string>;
  from: string;
  replyTo: string;
  adminModerationUrl: string;
}

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;
// "Display Name <local@domain>" or a bare address; no control characters (no header smuggling).
const FROM_PATTERN = /^(?:[^<>@]{1,64} <[^\s<>@]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}>|[^\s<>@]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})$/;

function read(env: AlertEnv, name: string): string | undefined {
  return env[name]?.trim() || undefined;
}

function siteUrl(env: AlertEnv, environment: AppEnvironment): string {
  const configured = read(env, "NEXT_PUBLIC_APP_URL") ?? read(env, "AUTH_URL");
  if (configured) return configured;
  if (environment === "production") return PRODUCTION_SITE_URL;
  if (environment === "staging") return STAGING_SITE_URL;
  return "http://localhost:3200";
}

function disabled(reason: AlertDisabledReason, environment: AppEnvironment, env: AlertEnv): ModerationAlertRuntime {
  return {
    state: { status: "disabled", reason },
    environment,
    addresses: new Map(),
    from: DEFAULT_ALERT_FROM,
    replyTo: ALERT_REPLY_TO,
    adminModerationUrl: new URL(ADMIN_MODERATION_PATH, siteUrl(env, environment)).toString(),
  };
}

export async function readModerationAlertConfig(env: AlertEnv = process.env): Promise<ModerationAlertRuntime> {
  const environment = resolveAppEnvironment(env);
  if (read(env, "MODERATION_ALERTS_ENABLED") !== "true") return disabled("flag-off", environment, env);

  const parsed = parseAlertRecipients(env.MODERATION_ALERT_RECIPIENTS);
  if (!parsed.ok) {
    return disabled(parsed.reason === "input-too-long" ? "invalid-recipient" : parsed.reason, environment, env);
  }

  const hashKey = env.MODERATION_ALERT_HASH_KEY;
  if (!isUsableHashKey(hashKey)) return disabled("hash-key-missing", environment, env);

  if (read(env, "EMAIL_PROVIDER") !== "resend" || !read(env, "RESEND_API_KEY")) {
    return disabled("provider-not-configured", environment, env);
  }

  const from = read(env, "MODERATION_ALERT_FROM") ?? DEFAULT_ALERT_FROM;
  if (CONTROL_CHARACTER.test(from) || !FROM_PATTERN.test(from)) return disabled("provider-not-configured", environment, env);

  const addresses = new Map<AddressHash, string>();
  for (const address of parsed.addresses) addresses.set(await hashAlertRecipient(hashKey, address), address);

  return {
    state: { status: "enabled", environment, recipients: [...addresses.keys()] },
    environment,
    addresses,
    from,
    replyTo: ALERT_REPLY_TO,
    adminModerationUrl: new URL(ADMIN_MODERATION_PATH, siteUrl(env, environment)).toString(),
  };
}
