import type { MessageRepository } from "@/features/messages/repository";
import type { Message } from "@/features/messages/types";
import { HOME_FIXED_MESSAGE_IDS } from "./fixedMessages";

export const HOME_HERO_NOTE_COUNT = 4;

/** Which caption the hero's cards carry: "most liked on the Wall", or "latest dots from the Wall". */
export type HomeHeroMode = "top-liked" | "latest";

export interface HomeHeroSelection {
  mode: HomeHeroMode;
  /** Pinned cards first (fixedMessages.ts), then the rule's — never the same card twice. */
  messages: Message[];
  /** The ids among `messages` that are pinned — HeroBrandComposition keeps them in the first places. */
  pinnedIds: string[];
}

/**
 * MB-01: the homepage's 4 cards.
 *
 * 1. Pinned cards (`HOME_FIXED_MESSAGE_IDS`) take the first places — but only
 *    while they are published (`status = "approved"`). A pinned card that
 *    was archived, rejected or deleted is skipped and its place goes to the
 *    rule; the page never fails because of it.
 * 2. The rest are the most liked published cards (any likes at all), and
 *    when fewer than that have likes, the newest published cards fill up.
 *    The pinned ids are excluded from both queries, so a pinned card the
 *    rule would also pick is never shown twice.
 *
 * The caption says "most liked" when every rule-picked place holds a liked
 * card, "latest" when the newest had to fill up. Anonymous cards carry only
 * the stored "anonymous" placeholder (never a real name); blocked authors
 * are hidden client-side (useHiddenMessageIds), as before.
 */
export async function selectHomeHeroMessages(
  messages: Pick<MessageRepository, "getById" | "listTopLikedApproved" | "listNewestApproved">,
  pinnedIds: readonly string[] = HOME_FIXED_MESSAGE_IDS
): Promise<HomeHeroSelection> {
  const pinnedRows = await Promise.all([...new Set(pinnedIds)].map((id) => messages.getById(id)));
  const pinned = pinnedRows
    .filter((message): message is Message => message !== null && message.status === "approved")
    .slice(0, HOME_HERO_NOTE_COUNT);

  const remaining = HOME_HERO_NOTE_COUNT - pinned.length;
  const exclude = pinned.map((message) => message.id);
  const liked = remaining > 0 ? await messages.listTopLikedApproved(exclude, remaining) : [];
  const fill =
    liked.length < remaining
      ? await messages.listNewestApproved([...exclude, ...liked.map((message) => message.id)], remaining - liked.length)
      : [];

  // Defensive: whatever a query returns, a card appears at most once.
  const seen = new Set<string>();
  const unique = [...pinned, ...liked, ...fill].filter((message) => !seen.has(message.id) && seen.add(message.id));

  return {
    mode: liked.length >= remaining ? "top-liked" : "latest",
    messages: unique.slice(0, HOME_HERO_NOTE_COUNT),
    pinnedIds: pinned.map((message) => message.id),
  };
}
