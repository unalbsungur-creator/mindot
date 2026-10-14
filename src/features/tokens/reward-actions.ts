"use server";

import { auth } from "@/features/auth/auth";
import { claimFirstShareRewardForSession, defaultFirstShareRewardGrant, type FirstShareRewardResult } from "./rewards";

/**
 * Called by /share/[messageId] after a Web Share completed ("shared").
 * Takes no arguments on purpose: the account is always the session's and
 * the amount is fixed server-side — see claimFirstShareRewardForSession.
 */
export async function claimFirstShareReward(): Promise<FirstShareRewardResult> {
  return claimFirstShareRewardForSession({
    getSessionUserId: async () => (await auth())?.user?.id ?? null,
    grant: defaultFirstShareRewardGrant,
  });
}
