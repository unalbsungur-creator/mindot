import { NextResponse } from "next/server";
import { revokeMobileSession } from "@/features/auth/mobileService";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid-request" },
      { status: 400 },
    );
  }

  const refreshToken =
    typeof body === "object" &&
    body !== null &&
    "refreshToken" in body &&
    typeof body.refreshToken === "string"
      ? body.refreshToken.trim()
      : "";

  if (!refreshToken) {
    return NextResponse.json(
      { ok: false, error: "invalid-request" },
      { status: 400 },
    );
  }

  try {
    const result = await revokeMobileSession(refreshToken);

    if (!result.ok) {
      const unavailable = result.error === "unavailable";

      return NextResponse.json(
        { ok: false, error: result.error },
        { status: unavailable ? 503 : 401 },
      );
    }

    return NextResponse.json({
      ok: true,
      status: result.status,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "unavailable" },
      { status: 503 },
    );
  }
}
