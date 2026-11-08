import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { locales } from "../config";
import { dictionaries } from "./index";

// MB-01: the brand message, the write invitation, the about-page date, the
// quote guideline and the quote UI copy exist in every interface language.

const SLOGANS = {
  tr: "AKLINDA KALMASIN.",
  en: "DON'T LEAVE IT UNSAID.",
  de: "LASS ES NICHT UNGESAGT.",
  fr: "NE LE GARDE PAS POUR TOI.",
  es: "NO TE LO GUARDES.",
} as const;

describe("MB-01 brand message in all five languages", () => {
  it("covers exactly the supported locales", () => {
    assert.deepEqual([...locales].sort(), Object.keys(SLOGANS).sort());
  });

  for (const locale of locales) {
    const d = dictionaries[locale];
    const slogan = SLOGANS[locale];

    describe(locale, () => {
      it("uses the fixed slogan as the homepage heading", () => {
        assert.equal(d.hero.heading, slogan);
      });

      it("uses the same one slogan everywhere — board, cards, images, PDF — and leads the footer with it", () => {
        assert.equal(d.boardPage.slogan, slogan);
        assert.ok(d.footer.tagline.startsWith(`${slogan} — `), d.footer.tagline);
        assert.match(d.footer.tagline, /1 (Milyon|Million|million|millón)/);
        assert.doesNotMatch(JSON.stringify(d.footer), /yaşayan|living wall|lebendige|mur vivant|muro vivo/i);
      });

      it("has the new homepage description and the million-dot progress sentence with a live count slot", () => {
        assert.ok(d.hero.description.endsWith("."), d.hero.description);
        assert.ok(d.hero.description.includes("…"), "the description keeps its “…” pause");
        assert.equal(d.pointsMilestone.progress.split("{count}").length, 2, "exactly one {count}");
        assert.match(d.pointsMilestone.progress, /1/);
        assert.match(d.pointsMilestone.progress, /Mindot/);
      });

      it("drops the retired “living wall / for humanity” hero copy", () => {
        const hero = JSON.stringify(d.hero).toLowerCase();
        for (const retired of ["yaşayan", "insanlığa", "living wall", "humanity", "lebendige", "menschheit", "mur vivant", "humanité", "muro vivo", "humanidad"]) {
          assert.ok(!hero.includes(retired), `${locale} hero still says “${retired}”`);
        }
      });

      it("leads the meta description and title with the slogan", () => {
        assert.ok(d.siteMeta.description.startsWith(slogan), d.siteMeta.description);
        assert.match(d.siteMeta.description, /Mindot/);
        assert.equal(d.siteMeta.title, `MINDOT — ${slogan}`);
      });

      it("has the write-page invitation", () => {
        assert.ok(d.write.invitation.length > 20);
      });

      it("dates the board story to 1994", () => {
        assert.match(d.panoStory.paragraphs[0], /^(1994|In 1994|En 1994)/);
        assert.ok(!/Yıllar önce|Years ago|Vor Jahren|Il y a des années|Hace años/.test(d.panoStory.paragraphs[0]));
      });

      it("adds the quote guideline right after the copyright section", () => {
        const sections = d.legal.guidelinesSections;
        const quote = sections.findIndex((section) => /lyrics|Songtext|chanson|canci|şarkı/i.test(section.body));
        assert.ok(quote > 0, "quote guideline missing");
        assert.match(sections[quote - 1].body.toLowerCase(), /copyright|telif|urheber|droit|derecho|kullanım|usage|nutzung|uso/);
      });

      it("names the next milestone under the bar, and the goal once reached", () => {
        assert.ok(d.pointsMilestone.nextStop.includes("{target}"), d.pointsMilestone.nextStop);
        assert.ok(d.pointsMilestone.goalReached.length > 5);
      });

      it("never says “dots left” (as in “remaining”) in the counter", () => {
        assert.doesNotMatch(d.pointsMilestone.progress, /dots left|points laissés/i);
      });

      it("ties the 1994 board to the 1-million-dot wall, and says “millions” nowhere", () => {
        assert.match(`${d.homeInfoBand.col4Line1} ${d.homeInfoBand.col4Highlight}`, /1994/);
        assert.match(d.homeInfoBand.col4Highlight, /1 (milyon|million|Million|millón)|un million/);
        assert.doesNotMatch(JSON.stringify(d), /milyonlarca|millions of|Millionen von|des millions|millones de/i);
      });

      it("has the latest-dots caption and the brand tagline as text", () => {
        assert.ok(d.hero.latestLabel.length > 5 && d.hero.latestLabel !== d.hero.topLikedLabel);
        const { lead, highlight, tail } = d.hero.brandTagline;
        for (const part of [lead, highlight, tail]) assert.ok(part.endsWith("."), part);
      });

      it("has every quote string, with the placeholders the UI fills in", () => {
        for (const [key, value] of Object.entries(d.quote)) assert.ok(value.trim().length > 0, `${locale}.quote.${key}`);
        assert.ok(d.quote.sharedBy.includes("{name}"));
        assert.ok(d.quote.errorAuthorTooLong.includes("{max}"));
        assert.ok(d.quote.moderationProposed.includes("{value}"));
      });
    });
  }
});
