import type { AppEnvironment } from "@/lib/appEnvironment";
import { PRODUCTION_SITE_URL, SITE_NAME, STAGING_SITE_URL } from "@/lib/siteConfig";
import type { AlertTemplateKind } from "../types";

/**
 * MN-01 moderation alerts — the email content (subject / HTML / text) only,
 * never the sending (see features/email/). Turkish, like the invitation
 * email: the audience is MINDOT's own admins.
 *
 * Privacy by construction: the only inputs are the notice kind, the pending
 * review COUNT, the admin moderation URL and the environment. No card
 * content, author, message id, token or recipient address can reach the
 * email because none is ever passed in. The URL is still validated and every
 * interpolated value is HTML-escaped.
 *
 * Environment labelling: staging subjects/bodies say [STAGING], development
 * [DEV], production carries no prefix. The URL must belong to the stated
 * environment (production → mind-ot.com, staging → staging.mind-ot.com,
 * development → a loopback host), so a staging alert can never point an
 * admin at production or the other way round.
 */

export const ADMIN_MODERATION_PATH = "/admin/moderation";

/** Upper bound for the displayed count — a larger value means the input is wrong, not that the queue is huge. */
export const MAX_ALERT_PENDING_COUNT = 1_000_000;

const ENVIRONMENT_PREFIX: Record<AppEnvironment, string> = {
  production: "",
  staging: "[STAGING] ",
  development: "[DEV] ",
};

const ENVIRONMENT_BANNER: Record<AppEnvironment, string | null> = {
  production: null,
  staging: "STAGING ortamı — bu bildirim gerçek kullanıcı verisi içermez.",
  development: "DEV ortamı — bu bildirim yerel geliştirme ortamından gönderildi.",
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export interface ModerationAlertEmailInput {
  kind: AlertTemplateKind;
  pendingReviewCount: number;
  /** The absolute URL of /admin/moderation in this environment (sign-in required there). */
  adminModerationUrl: string;
  environment: AppEnvironment;
}

export interface ModerationAlertEmailContent {
  subject: string;
  html: string;
  text: string;
}

export type ModerationAlertEmailResult =
  | { ok: true; content: ModerationAlertEmailContent }
  | { ok: false; reason: "invalid-kind" | "invalid-environment" | "invalid-count" | "unsafe-url" };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The canonical moderation URL, or null when it isn't safe for this environment. */
function safeModerationUrl(raw: string, environment: AppEnvironment): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;
  // Reject anything a URL parser would silently strip or normalize away.
  if (/[\u0000- \u007f-\u009f\\]/.test(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username !== "" || url.password !== "") return null;
  if (url.pathname !== ADMIN_MODERATION_PATH || url.search !== "" || url.hash !== "") return null;
  // The input must already BE the canonical form: no dot segments, encodings,
  // explicit default ports, upper-case hosts, "?" or "#" that a parser would
  // quietly normalize into an acceptable-looking URL.
  const canonical = `${url.origin}${ADMIN_MODERATION_PATH}`;
  if (raw !== canonical) return null;

  if (environment === "production") {
    if (url.origin !== new URL(PRODUCTION_SITE_URL).origin) return null;
  } else if (environment === "staging") {
    if (url.origin !== new URL(STAGING_SITE_URL).origin) return null;
  } else {
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!LOOPBACK_HOSTS.has(url.hostname)) return null;
  }
  return canonical;
}

export function moderationAlertEmailContent(input: ModerationAlertEmailInput): ModerationAlertEmailResult {
  if (input.kind !== "initial" && input.kind !== "reminder") return { ok: false, reason: "invalid-kind" };
  if (!Object.prototype.hasOwnProperty.call(ENVIRONMENT_PREFIX, input.environment)) {
    return { ok: false, reason: "invalid-environment" };
  }
  const count = input.pendingReviewCount;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 1 || count > MAX_ALERT_PENDING_COUNT) {
    return { ok: false, reason: "invalid-count" };
  }
  const url = safeModerationUrl(input.adminModerationUrl, input.environment);
  if (url === null) return { ok: false, reason: "unsafe-url" };

  const prefix = ENVIRONMENT_PREFIX[input.environment];
  const banner = ENVIRONMENT_BANNER[input.environment];
  const countText = String(count);

  const subject =
    input.kind === "initial"
      ? `${prefix}${SITE_NAME}: Moderasyon kuyruğunda inceleme bekleyen içerik var (${countText})`
      : `${prefix}${SITE_NAME} hatırlatma: ${countText} içerik hâlâ inceleme bekliyor`;
  const lead =
    input.kind === "initial"
      ? "Moderasyon kuyruğuna inceleme bekleyen yeni içerik geldi."
      : "Moderasyon kuyruğunda hâlâ inceleme bekleyen içerik var.";
  const countLine = `Şu anda inceleme bekleyen içerik sayısı: ${countText}.`;
  const cta = "Moderasyon kuyruğunu aç";
  const footer =
    "İçerik ayrıntıları güvenlik nedeniyle bu e-postaya eklenmez. Kuyruğu görmek için yönetici hesabıyla giriş yapmanız gerekir.";

  const textLines = [
    ...(banner ? [`${prefix.trim()} ${banner}`, ""] : []),
    lead,
    countLine,
    "",
    `${cta}: ${url}`,
    "",
    footer,
  ];
  const text = textLines.join("\n");

  const safeUrl = escapeHtml(url);
  const bannerHtml = banner
    ? `<p style="font-size: 12px; font-weight: 700; color: #b42318; margin: 0 0 16px;">${escapeHtml(`${prefix.trim()} ${banner}`)}</p>`
    : "";
  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #201d18;">
      ${bannerHtml}
      <p style="font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #ff6a00; margin: 0 0 16px;">${escapeHtml(SITE_NAME)}</p>
      <p style="font-size: 16px; line-height: 1.6; margin: 0 0 8px;">${escapeHtml(lead)}</p>
      <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px;">${escapeHtml(countLine)}</p>
      <p style="margin: 0 0 24px;">
        <a href="${safeUrl}" style="display: inline-block; background: #ff6a00; color: #0d1b2a; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 999px;">${escapeHtml(cta)}</a>
      </p>
      <p style="font-size: 13px; line-height: 1.6; color: #63594c; word-break: break-all;">${safeUrl}</p>
      <p style="font-size: 12px; line-height: 1.6; color: #63594c; margin: 24px 0 0;">${escapeHtml(footer)}</p>
    </div>
  `.trim();

  return { ok: true, content: { subject, html, text } };
}
