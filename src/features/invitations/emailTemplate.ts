import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/translations";
import { SUPPORT_REPLY_TO } from "@/features/email/addresses";

/**
 * The invitation email — content only (subject/html/text), never the sending
 * itself (features/email/). In the language the admin picked for the
 * recipient (5 locales); the brand slogan ("AKLINDA KALMASIN." and its
 * translations) and the one-line description are the homepage's own
 * (`hero.heading` / `hero.description`), so they never drift apart.
 *
 * Headline and subject: "{name} invited you to MINDOT" with the inviter's
 * display name — escaped, at most 40 characters ("…"), and never an email
 * address (a name that contains "@" is treated as no name) — or the
 * anonymous "A friend invited you…" without one. No personal note.
 *
 * `inviteUrl` is always the real link built from the invitation's token
 * (actions.ts); `siteUrl` is the environment's own origin (logo, footer).
 */

export const MAX_INVITER_NAME_LENGTH = 40;
export const INVITE_EMAIL_LOGO_PATH = "/images/email/mindot-logo.png";

// C0/C1 controls, plus the Unicode line and paragraph separators (U+2028, U+2029).
const CONTROL_CHARACTERS = new RegExp(`[\u0000-\u001f\u007f-\u009f${String.fromCharCode(0x2028, 0x2029)}]`, "g");

/** The inviter's name as shown, or null for "a friend". Never an email address. */
export function inviterDisplayName(name: string | null | undefined): string | null {
  if (typeof name !== "string") return null;
  const clean = name.replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim();
  if (!clean || clean.includes("@")) return null;
  const chars = [...clean];
  return chars.length > MAX_INVITER_NAME_LENGTH ? `${chars.slice(0, MAX_INVITER_NAME_LENGTH - 1).join("").trimEnd()}…` : clean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface InviteEmailInput {
  inviteUrl: string;
  /** The inviter's display name (session); null/empty → the anonymous wording. */
  inviterName: string | null;
  /** The recipient's language, chosen by the admin; anything unknown falls back to the default. */
  locale: string;
  /** The environment's origin, e.g. https://mind-ot.com. */
  siteUrl: string;
}

export function inviteEmailContent(input: InviteEmailInput): { subject: string; html: string; text: string } {
  const locale: Locale = (locales as readonly string[]).includes(input.locale) ? (input.locale as Locale) : defaultLocale;
  const dictionary = getDictionary(locale);
  const t = dictionary.inviteEmail;
  const name = inviterDisplayName(input.inviterName);
  const headline = name ? t.subjectNamed.replace("{name}", name) : t.subjectAnonymous;
  const subject = headline;
  const slogan = dictionary.hero.heading;
  const description = dictionary.hero.description;
  const site = new URL(input.siteUrl);
  const siteHost = site.host;
  const logoUrl = new URL(INVITE_EMAIL_LOGO_PATH, site).toString();

  const text = [
    headline,
    "",
    description,
    "",
    slogan,
    "",
    `${t.ctaButton}: ${input.inviteUrl}`,
    "",
    "—",
    t.footerReason,
    `${siteHost} · ${SUPPORT_REPLY_TO}`,
  ].join("\n");

  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3efe4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fffdf8;border-radius:16px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#201d18;">
<tr><td align="center" style="background:#031225;padding:20px 24px;">
<img src="${e(logoUrl)}" width="280" height="98" alt="MINDOT" style="display:block;border:0;width:280px;max-width:100%;height:auto;">
</td></tr>
<tr><td style="padding:32px 32px 8px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.35;font-weight:700;color:#0d1b2a;">${e(headline)}</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#201d18;">${e(description)}</p>
<p style="margin:0 0 28px;font-size:13px;font-weight:700;letter-spacing:0.12em;color:#ff6a00;">${e(slogan)}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:#ff6a00;">
<a href="${e(input.inviteUrl)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#0d1b2a;text-decoration:none;border-radius:999px;">${e(t.ctaButton)}</a>
</td></tr></table>
<p style="margin:24px 0 6px;font-size:13px;line-height:1.5;color:#63594c;">${e(t.linkHint)}</p>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${e(input.inviteUrl)}" style="color:#0d1b2a;">${e(input.inviteUrl)}</a></p>
</td></tr>
<tr><td style="padding:20px 32px 28px;border-top:1px solid #ece5d6;">
<p style="margin:0 0 10px;font-size:12px;line-height:1.6;color:#63594c;">${e(t.footerReason)}</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:#63594c;"><a href="${e(site.origin)}" style="color:#63594c;">${e(siteHost)}</a> · <a href="mailto:${SUPPORT_REPLY_TO}" style="color:#63594c;">${SUPPORT_REPLY_TO}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
