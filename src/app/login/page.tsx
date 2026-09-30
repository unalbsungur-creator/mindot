import { redirect } from "next/navigation";
import { auth } from "@/features/auth/auth";
import { LoginPageContent, type LoginError } from "./_components/LoginPageContent";

/**
 * Only these reach the UI as specific messages (see SignInRefusal in
 * features/auth/auth.ts); any other `?error=` — Auth.js's own codes for a
 * cancelled consent or a failed OAuth check, or anything hand-edited into
 * the URL — becomes one generic message. Nothing from the query string is
 * ever rendered as-is.
 */
function toLoginError(value: string | string[] | undefined): LoginError | null {
  if (typeof value !== "string" || !value) return null;
  if (value === "account-exists" || value === "apple-email-missing") return value;
  return "generic";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await auth();

  if (session?.user?.role === "admin") {
    redirect("/admin");
  }

  if (session?.user?.id) {
    redirect("/me");
  }

  const { error } = await searchParams;
  return <LoginPageContent error={toLoginError(error)} />;
}
