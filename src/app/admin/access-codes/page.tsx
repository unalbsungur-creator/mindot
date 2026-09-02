import { auth } from "@/features/auth/auth";
import { digitalAccessCodeRepository } from "@/features/memories/repository";
import { AccessCodesPageContent } from "./_components/AccessCodesPageContent";

export default async function AdminAccessCodesPage() {
  const session = await auth();
  const authorized = session?.user?.role === "admin";

  const codes = authorized ? await digitalAccessCodeRepository.list() : [];

  return <AccessCodesPageContent authorized={authorized} codes={codes} />;
}
