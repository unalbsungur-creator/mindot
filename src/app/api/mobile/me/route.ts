import { NextResponse } from "next/server";
import { authenticateMobileRequest } from "@/features/auth/mobileService";
import { userRepository } from "@/features/users/repository";

export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(
    request.headers.get("authorization"),
  );

  if (!auth.ok) {
    const status =
      auth.error === "unauthorized"
        ? 401
        : auth.error === "admin-account"
          ? 403
          : 503;

    return NextResponse.json(
      { ok: false, error: auth.error },
      { status },
    );
  }

  try {
    const user = await userRepository.getById(auth.identity.userId);

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        publicId: user.publicId,
        publicWallEnabled: user.publicWallEnabled,
        publicWallDescription: user.publicWallDescription,
        status: user.status,
        createdAt: user.createdAt,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "unavailable" },
      { status: 503 },
    );
  }
}
