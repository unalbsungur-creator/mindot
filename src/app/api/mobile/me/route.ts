import { NextResponse } from "next/server";
import { authenticateMobileRequest } from "@/features/auth/mobileService";
import { userRepository } from "@/features/users/repository";
import { handleMobileMe } from "../lib/meHandler";

export async function GET(request: Request) {
  const result = await handleMobileMe(
    request.headers.get("authorization"),
    {
      authenticate: authenticateMobileRequest,
      getUserById: (id) => userRepository.getById(id),
    },
  );

  return NextResponse.json(result.body, { status: result.status });
}
