"use client";

import { useId } from "react";
import Link from "next/link";
import { useLocale } from "@/i18n/LocaleProvider";
import type { BlockedUserSummary } from "../types";
import { BlockUserButton } from "./BlockUserButton";

/** The viewer's own block list on /me — the one place every block can be undone from. */
export function BlockedUsersSection({ users }: { users: BlockedUserSummary[] }) {
  const { dictionary } = useLocale();
  const t = dictionary.blocking;
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="mx-auto flex w-full max-w-md flex-col gap-3 border-t border-border pt-6">
      <div className="flex flex-col gap-1 text-center">
        <h2 id={headingId} className="text-sm font-medium text-navy">
          {t.listTitle}
        </h2>
        <p className="text-xs text-ink-soft">{t.listHint}</p>
      </div>
      {users.length === 0 ? (
        <p className="text-center text-xs text-ink-soft">{t.listEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {users.map((user) => {
            const name = user.displayName ?? "MINDOT";
            return (
              <li key={user.publicId} className="flex items-center justify-between gap-3 px-3 py-1">
                <Link href={`/u/${user.publicId}`} className="flex min-w-0 items-center gap-2 text-sm text-navy hover:underline">
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- tiny avatar from an arbitrary Google profile URL, same call as the header's
                    <img src={user.image} alt="" referrerPolicy="no-referrer" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-canvas text-xs font-medium">
                      {name[0]?.toUpperCase()}
                    </span>
                  )}
                  <span className="truncate">{name}</span>
                </Link>
                <BlockUserButton publicId={user.publicId} displayName={name} blocked />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
