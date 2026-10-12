import { requireAdmin } from "@/features/auth/requireAdmin";
import { loadTokenHistory } from "@/features/tokens/history";
import { tokenRepository } from "@/features/tokens/repository";
import { userRepository } from "@/features/users/repository";
import { TokenHistoryPageContent } from "./_components/TokenHistoryPageContent";

export const dynamic = "force-dynamic";

export default async function TokenHistoryPage({ searchParams }: PageProps<"/admin/tokens">) {
  const { cursor } = await searchParams;
  // Same shape as every other admin page: loadTokenHistory checks the admin
  // first, so an unauthorized visitor never triggers the ledger query or
  // receives any of it in the payload. Read-only — nothing here writes.
  const result = await loadTokenHistory(
    { cursor: typeof cursor === "string" ? cursor : null },
    {
      requireAdmin,
      listLedger: (input) => tokenRepository.listLedger(input),
      getActiveUsersByIds: (ids) => userRepository.getActiveByIds(ids),
    }
  );

  return <TokenHistoryPageContent result={result} isFirstPage={typeof cursor !== "string"} />;
}
