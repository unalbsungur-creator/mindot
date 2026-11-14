import type postgres from "postgres";

/**
 * Security pack 2b, item 3 — the one-off cleanup for accounts deleted before
 * `deleteAccount` started cutting the invitation trail. A card of a deleted
 * account (author = a tombstone, users.deleted_at set) that still carries
 * `invitation_id` leads to that invitation's `recipient_email` — usually the
 * very person who wrote it. This clears the address on every such invitation
 * and drops the cards' `invitation_id`, in one transaction.
 *
 * Limits: the deleted person's own email is gone, so an invitation sent to
 * them that they never wrote with can't be recognized any more — only the
 * invitations their cards point at are cleared. An invitation that a deleted
 * account and a still-active one both wrote with is cleared too (the address
 * can't be attributed); the dry run counts those separately.
 *
 * Idempotent: a second run finds nothing. Reads and reports only ids and
 * counts — never an address.
 */

export interface DeletedInvitationUnlinkPlan {
  /** Cards of deleted accounts that still point at an invitation. */
  cardIds: string[];
  /** Invitations those cards point at that still hold an address. */
  invitationIds: string[];
  /** Of those, invitations an active account also wrote with. */
  sharedWithActiveAuthors: number;
}

export async function planDeletedInvitationUnlink(sql: postgres.Sql | postgres.TransactionSql): Promise<DeletedInvitationUnlinkPlan> {
  const cards = await sql<{ id: string }[]>`
    select m.id from messages m join users u on u.id = m.author_id
    where u.deleted_at is not null and m.invitation_id is not null
    order by m.id`;
  const invitations = await sql<{ id: string; shared: boolean }[]>`
    select i.id,
      exists (
        select 1 from messages m2 join users u2 on u2.id = m2.author_id
        where m2.invitation_id = i.id and u2.deleted_at is null
      ) as shared
    from invitations i
    where i.recipient_email is not null
      and i.id in (
        select m.invitation_id from messages m join users u on u.id = m.author_id
        where u.deleted_at is not null and m.invitation_id is not null
      )
    order by i.id`;
  return {
    cardIds: cards.map((row) => row.id),
    invitationIds: invitations.map((row) => row.id),
    sharedWithActiveAuthors: invitations.filter((row) => row.shared).length,
  };
}

export interface DeletedInvitationUnlinkResult extends DeletedInvitationUnlinkPlan {
  applied: boolean;
  invitationsCleared: number;
  cardsUnlinked: number;
}

export async function runDeletedInvitationUnlink(sql: postgres.Sql, options: { apply: boolean }): Promise<DeletedInvitationUnlinkResult> {
  if (!options.apply) {
    return { ...(await planDeletedInvitationUnlink(sql)), applied: false, invitationsCleared: 0, cardsUnlinked: 0 };
  }
  return sql.begin(async (tx) => {
    const plan = await planDeletedInvitationUnlink(tx);
    // Addresses first (the subquery needs the cards' invitation_id), then the cards.
    const cleared = await tx`
      update invitations set recipient_email = null
      where recipient_email is not null
        and id in (
          select m.invitation_id from messages m join users u on u.id = m.author_id
          where u.deleted_at is not null and m.invitation_id is not null
        )`;
    const unlinked = await tx`
      update messages m set invitation_id = null
      from users u
      where u.id = m.author_id and u.deleted_at is not null and m.invitation_id is not null`;
    return { ...plan, applied: true, invitationsCleared: cleared.count, cardsUnlinked: unlinked.count };
  }) as Promise<DeletedInvitationUnlinkResult>;
}
