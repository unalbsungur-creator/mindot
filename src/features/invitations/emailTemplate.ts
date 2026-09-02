import { SITE_NAME } from "@/lib/siteConfig";

/**
 * EPIC: Davet Ekranından Gerçek E-mail Daveti — content only (subject/
 * html/text), never the sending mechanism itself (see features/email/).
 * `inviteUrl` is always the real invite link built from the actual token
 * (see actions.ts) — this function never invents or hardcodes a URL.
 * Turkish-only by design: the admin creating an invite (not the eventual
 * recipient) is the audience this whole admin surface is already written
 * for in Turkish throughout, and a full per-recipient-locale email system
 * is well beyond what this EPIC asked for.
 */
export function inviteEmailContent(inviteUrl: string): { subject: string; html: string; text: string } {
  const subject = `${SITE_NAME}'a davet edildiniz`;
  const intro = `${SITE_NAME}'ta yaşayan düşünce duvarına katılmanız için size özel bir davet oluşturuldu.`;
  const cta = "Davetini Kabul Et";

  const text = `${intro}\n\n${cta}: ${inviteUrl}`;

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #201d18;">
      <p style="font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #ff6a00; margin: 0 0 16px;">${SITE_NAME}</p>
      <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px;">${intro}</p>
      <p style="margin: 0 0 24px;">
        <a href="${inviteUrl}" style="display: inline-block; background: #ff6a00; color: #0d1b2a; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 999px;">${cta}</a>
      </p>
      <p style="font-size: 13px; line-height: 1.6; color: #63594c; word-break: break-all;">${inviteUrl}</p>
    </div>
  `.trim();

  return { subject, html, text };
}
