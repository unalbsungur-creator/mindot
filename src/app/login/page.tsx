import { redirect } from "next/navigation";
import { auth } from "@/features/auth/auth";
import { LoginPageContent } from "./_components/LoginPageContent";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user?.role === "admin") {
    redirect("/admin");
  }

  if (session?.user?.id) {
    redirect("/me");
  }

  return <LoginPageContent />;
}
