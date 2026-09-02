import { digitalAccessCodeRepository } from "../repository";
import type { DigitalPurchaseProvider } from "./types";

/**
 * The only `DigitalPurchaseProvider` that exists — Architecturally
 * prepared, not live-integrated. There is no real Shoppier webhook or API
 * call here; this is what an admin (or, for now, this codebase's own
 * validation tooling) uses to record that a sale happened somewhere else
 * and a code should exist for it. Its `name` is always "manual" so a code
 * issued this way is never confused with a verified real-provider
 * purchase in `digital_access_codes.externalProvider`.
 *
 * Adding real Shoppier support later means a new file here implementing
 * the same interface, wired to Shoppier's actual webhook/API — this
 * provider stays as the fallback for anything issued outside that flow.
 */
export const manualDigitalPurchaseProvider: DigitalPurchaseProvider = {
  name: "manual",
  async issueAccessCode({ expiresInDays, reference }) {
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;
    const issued = await digitalAccessCodeRepository.issue({
      expiresAt,
      externalProvider: "manual",
      externalReference: reference ?? null,
    });
    return { code: issued.code };
  },
};
