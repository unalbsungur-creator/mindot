import type { User } from "@/features/users/types";

type AuthResult =
  | {
      ok: true;
      identity: {
        userId: string;
        status: "active" | "suspended";
      };
    }
  | {
      ok: false;
      error: "unauthorized" | "admin-account" | "unavailable";
    };

interface MeHandlerDeps {
  authenticate: (authorizationHeader: string | null) => Promise<AuthResult>;
  getUserById: (id: string) => Promise<User | null>;
}

export async function handleMobileMe(
  authorizationHeader: string | null,
  deps: MeHandlerDeps,
) {
  const auth = await deps.authenticate(authorizationHeader);

  if (!auth.ok) {
    const status =
      auth.error === "unauthorized"
        ? 401
        : auth.error === "admin-account"
          ? 403
          : 503;

    return {
      status,
      body: { ok: false as const, error: auth.error },
    };
  }

  try {
    const user = await deps.getUserById(auth.identity.userId);

    if (!user) {
      return {
        status: 401,
        body: { ok: false as const, error: "unauthorized" as const },
      };
    }

    return {
      status: 200,
      body: {
        ok: true as const,
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
      },
    };
  } catch {
    return {
      status: 503,
      body: { ok: false as const, error: "unavailable" as const },
    };
  }
}

export type { MeHandlerDeps };
