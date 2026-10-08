import { NextResponse } from "next/server";
import { completeGoogleSignIn } from "@/features/auth/service";
import { createMobileSession } from "@/features/auth/mobileService";
import { verifyGoogleIdToken } from "@/features/auth/lib/googleProfile";
import { getAuthRuntimeConfig } from "@/lib/env";
const VALID_PLATFORMS = ["ios", "android"] as const;
type MobilePlatform = (typeof VALID_PLATFORMS)[number];
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const idToken = typeof body?.idToken === "string" ? body.idToken.trim() : "";
    const platform = typeof body?.platform === "string" ? body.platform : "";
    if (!idToken || !VALID_PLATFORMS.includes(platform as MobilePlatform)) {
      return NextResponse.json({ ok: false, error: "invalid-request" }, { status: 400 });
    }
    const authConfig = getAuthRuntimeConfig();
    if (!authConfig.clientId) {
      return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
    }
    const identity = await verifyGoogleIdToken(idToken, [authConfig.clientId]);
    if (!identity) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const signIn = await completeGoogleSignIn({ ...identity, email: identity.email! });
    if (!signIn.ok) {
      if (signIn.refusal === "account-exists") {
        return NextResponse.json({ ok: false, error: "account-exists" }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const session = await createMobileSession({
      userId: signIn.user.id,
      platform: platform as MobilePlatform,
    });
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
    }
    return NextResponse.json({
      ok: true,
      user: {
        id: signIn.user.id,
        name: signIn.user.name,
        email: signIn.user.email,
        image: signIn.user.image,
      },
      tokens: session.tokens,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
