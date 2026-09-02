"use server";

import { signIn, signOut } from "./auth";

export async function signInWithGoogle(redirectTo: string) {
  await signIn("google", { redirectTo });
}

export async function signOutOfMindot(redirectTo: string) {
  await signOut({ redirectTo });
}
