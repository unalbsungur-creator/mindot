import { requireAdmin } from "@/features/auth/requireAdmin";
import { digitalAccessCodeRepository } from "@/features/memories/repository";
import { AccessCodesPageContent } from "./_components/AccessCodesPageContent";

export default async function AdminAccessCodesPage() {
  const adminUser = await requireAdmin();
  const authorized = adminUser !== null;

  const codes = authorized ? await digitalAccessCodeRepository.list() : [];

  return <AccessCodesPageContent authorized={authorized} codes={codes} />;
}
