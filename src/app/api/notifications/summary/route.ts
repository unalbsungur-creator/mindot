import { NextResponse } from "next/server";
import { auth } from "@/features/auth/auth";
import { notificationRepository } from "@/features/notifications/repository";

const BELL_RECENT_LIMIT = 10;

/**
 * NotificationBell's one data source — same "narrow, safe, always-200"
 * shape as `/api/session/summary`. The recipient is always `session.user.id`
 * from the server-verified session, never anything a caller could supply;
 * an unauthenticated request gets the same safe empty shape back (no error,
 * nothing to leak) rather than a 401, since a signed-out visitor never
 * renders the bell that calls this in the first place — this endpoint just
 * never trusts that alone. No polling: the client fetches this once on
 * mount, not on an interval.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ unreadCount: 0, items: [] });
  }

  const [unreadCount, page] = await Promise.all([
    notificationRepository.countUnreadForUser(session.user.id),
    notificationRepository.listForUser(session.user.id, { limit: BELL_RECENT_LIMIT, offset: 0 }),
  ]);

  return NextResponse.json({ unreadCount, items: page.items });
}
