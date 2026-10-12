import { tokenRepository, type GrantFirstShareRewardResult } from "./repository";

export type FirstShareRewardResult =
  | { status: "granted"; amount: number; balance: number }
  | { status: "already-rewarded" | "ineligible" | "auth-required" | "failed" };

export interface FirstShareRewardDeps {
  /** The signed-in account's id from the server session — never a client value. */
  getSessionUserId: () => Promise<string | null>;
  grant: (userId: string) => Promise<GrantFirstShareRewardResult>;
}

/**
 * The first-share reward, for the session's own account only. The client
 * reports that a Web Share completed, nothing more: who is credited comes
 * from the session, how much and whether at all from
 * tokenRepository.grantFirstShareReward (one transaction, once per account).
 *
 * The report itself can't be verified — anyone signed in can call this
 * without sharing, and a completed share sheet doesn't prove anything was
 * published. The bound is what the repository enforces: one reward per
 * account. Failures are logged and reported as `failed`; the share itself
 * already happened and is never affected.
 */
export async function claimFirstShareRewardForSession(deps: FirstShareRewardDeps): Promise<FirstShareRewardResult> {
  const userId = await deps.getSessionUserId();
  if (!userId) return { status: "auth-required" };
  try {
    const result = await deps.grant(userId);
    switch (result.status) {
      case "granted":
        return { status: "granted", amount: result.entry.amount, balance: result.balance };
      case "already_rewarded":
        return { status: "already-rewarded" };
      case "ineligible":
        return { status: "ineligible" };
    }
  } catch (error) {
    console.error("[first-share-reward] claim failed", error);
    return { status: "failed" };
  }
}

export const defaultFirstShareRewardGrant = (userId: string) => tokenRepository.grantFirstShareReward(userId);
