import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/translations";
import { INVITE_EMAIL_LOGO_PATH, inviteEmailContent, inviterDisplayName, MAX_INVITER_NAME_LENGTH } from "./emailTemplate";

const BASE = { inviteUrl: "https://mind-ot.com/invite/AbC123_token", inviterName: "Ünal Büyüksungur", locale: "tr", siteUrl: "https://mind-ot.com" };

describe("inviterDisplayName", () => {
  it("keeps a normal name, trimmed and with its spaces collapsed", () => {
    assert.equal(inviterDisplayName("  Ünal   Büyüksungur "), "Ünal Büyüksungur");
  });

  it("caps the name at 40 characters with an ellipsis", () => {
    const long = "Abdurrahman Muhammed Alparslan Yıldırımoğlu Kaya";
    const shown = inviterDisplayName(long)!;
    assert.equal([...shown].length <= MAX_INVITER_NAME_LENGTH, true);
    assert.ok(shown.endsWith("…"));
    assert.equal(inviterDisplayName("x".repeat(40)), "x".repeat(40));
  });

  it("never shows an email address — a name containing @ counts as no name", () => {
    assert.equal(inviterDisplayName("admin@mind-ot.com"), null);
    assert.equal(inviterDisplayName("Ünal <unal@example.com>"), null);
  });

  it("treats a missing or blank name as no name and strips line breaks", () => {
    assert.equal(inviterDisplayName(null), null);
    assert.equal(inviterDisplayName("   "), null);
    assert.equal(inviterDisplayName("Ünal\r\nBcc: x"), "Ünal Bcc: x");
  });
});

describe("inviteEmailContent", () => {
  it("names the inviter in the subject and the headline", () => {
    const { subject, html, text } = inviteEmailContent(BASE);
    assert.equal(subject, "Ünal Büyüksungur seni MINDOT'a davet etti");
    assert.ok(html.includes("Ünal Büyüksungur seni MINDOT&#39;a davet etti"));
    assert.ok(text.startsWith("Ünal Büyüksungur seni MINDOT'a davet etti"));
  });

  it("uses the anonymous wording without a name", () => {
    for (const inviterName of [null, "", "admin@mind-ot.com"]) {
      assert.equal(inviteEmailContent({ ...BASE, inviterName }).subject, "Bir arkadaşın seni MINDOT'a davet etti");
    }
  });

  it("escapes the name in the HTML", () => {
    const { html, subject } = inviteEmailContent({ ...BASE, inviterName: "<img src=x onerror=alert(1)>" });
    assert.ok(!html.includes("<img src=x"));
    assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
    assert.ok(!/[\r\n]/.test(subject));
  });

  it("carries the slogan, the description, the button, the plain link and the footer — and no old wording", () => {
    const { html, text } = inviteEmailContent(BASE);
    for (const part of [html, text]) {
      assert.ok(part.includes("AKLINDA KALMASIN."));
      assert.ok(part.includes("Söyleyemediğin bir söz, bir anı, bir duygu"));
      assert.ok(part.includes("Bu e-postayı, biri seni MINDOT'a davet ettiği için aldın.".replace("'", part === html ? "&#39;" : "'")));
      assert.ok(part.includes("destek@mind-ot.com"));
      assert.ok(part.includes("mind-ot.com"));
      assert.ok(!part.includes("yaşayan düşünce duvarı"));
    }
    assert.ok(html.includes(`href="${BASE.inviteUrl}"`));
    assert.equal(html.split(BASE.inviteUrl).length - 1, 3, "button href, plain-link href and its visible text");
    assert.ok(html.includes(`src="https://mind-ot.com${INVITE_EMAIL_LOGO_PATH}"`));
    assert.ok(!html.includes("Bir düşünce. Bir nokta."), "the logo carries no tagline");
  });

  it("speaks the recipient's language in all five locales, with that locale's slogan", () => {
    for (const locale of locales) {
      const d = getDictionary(locale);
      const { subject, html } = inviteEmailContent({ ...BASE, locale });
      assert.equal(subject, d.inviteEmail.subjectNamed.replace("{name}", "Ünal Büyüksungur"), locale);
      assert.ok(html.includes(d.hero.heading.replace("'", "&#39;")), `${locale} slogan`);
      assert.ok(html.includes(`lang="${locale}"`));
    }
    assert.equal(inviteEmailContent({ ...BASE, locale: "xx" }).subject, "Ünal Büyüksungur seni MINDOT'a davet etti", "unknown → default");
  });

  it("addresses the reader as \"sen\" throughout in Turkish (never \"siz\")", () => {
    for (const inviterName of ["Ünal Büyüksungur", null]) {
      const { text } = inviteEmailContent({ ...BASE, inviterName });
      assert.doesNotMatch(text, /siz(i|in|e)?|[nN][ıi]z|sınız|siniz|sanız|seniz/, text);
    }
    assert.ok(inviteEmailContent(BASE).text.includes("Bu e-postayı, biri seni MINDOT'a davet ettiği için aldın. İlgilenmiyorsan bu e-postayı yok sayabilirsin."));
  });

  it("sends a plain-text part next to the HTML, and a logo whose alt text stays readable on the dark band", () => {
    for (const locale of locales) {
      const { html, text } = inviteEmailContent({ ...BASE, locale });
      assert.ok(text.trim().length > 80, locale);
      assert.ok(!/<[a-z]/i.test(text), `${locale} text part carries no markup`);
      assert.ok(text.includes(BASE.inviteUrl), `${locale} text part carries the link`);
      assert.ok(html.length > text.length);
    }
    const img = /<img [^>]*>/.exec(inviteEmailContent(BASE).html)![0];
    for (const attr of ['width="280"', 'height="98"', 'alt="MINDOT"', "color:#ffffff", "font-weight:700"]) assert.ok(img.includes(attr), attr);
    assert.ok(inviteEmailContent(BASE).html.includes('bgcolor="#031225"'), "dark band even without CSS");
  });

  it("shows the environment's own host in the footer and logo", () => {
    const { html, text } = inviteEmailContent({ ...BASE, siteUrl: "https://staging.mind-ot.com", inviteUrl: "https://staging.mind-ot.com/invite/t" });
    assert.ok(html.includes("https://staging.mind-ot.com/images/email/mindot-logo.png"));
    assert.ok(text.includes("staging.mind-ot.com · destek@mind-ot.com"));
  });
});
