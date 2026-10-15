"use client";

import { SignInOptions } from "@/components/auth/SignInOptions";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { formatTryPrice } from "@/features/tokens/lib/shopierPurchaseForm";
import { useLocale } from "@/i18n/LocaleProvider";

/** One package as the server hands it over: display data, whether it's on sale, and — for a signed-in account only — its checked Shopier link. */
export interface TokenPackageListing {
  id: string;
  tokens: number;
  priceTry: number;
  onSale: boolean;
  /** Null for a guest, and for a package that isn't on sale. */
  purchaseUrl: string | null;
}

/**
 * /tokens body. Renders what the server page decided and nothing more: it
 * never builds or checks a link itself, and a guest's listing carries none.
 */
export function TokensPageContent({
  account,
  packages,
}: {
  /** The signed-in account, or null for a guest. */
  account: { email: string; balance: number } | null;
  packages: TokenPackageListing[];
}) {
  const { dictionary, locale } = useLocale();
  const t = dictionary.tokenPurchase;
  const noneOnSale = packages.every((pkg) => !pkg.onSale);

  return (
    <PageContainer className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-medium text-navy sm:text-4xl">{t.pageTitle}</h1>
        <p className="text-ink-soft">{t.intro}</p>
      </header>

      {account ? (
        <section className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4 text-sm">
          <p className="font-medium text-navy">{t.balance.replace("{count}", String(account.balance))}</p>
          <p className="break-all text-ink-soft">{t.accountEmail.replace("{email}", account.email)}</p>
          <p className="text-ink-soft">{t.emailMatchHint}</p>
        </section>
      ) : (
        <section className="flex flex-col items-center gap-4 rounded-lg border border-border bg-surface p-5 text-center">
          <p className="text-sm text-ink-soft">{t.signInPrompt}</p>
          <SignInOptions redirectTo="/tokens" />
        </section>
      )}

      {noneOnSale && (
        <p role="status" className="text-center text-sm text-orange-ink">
          {t.noneOnSale}
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-3">
        {packages.map((pkg) => (
          <li key={pkg.id} className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface p-5 text-center shadow-card">
            <p className="font-display text-2xl font-medium text-navy">{t.packageTokens.replace("{count}", String(pkg.tokens))}</p>
            <p className="text-lg text-ink">{formatTryPrice(pkg.priceTry, locale)}</p>
            {pkg.purchaseUrl ? (
              <Button href={pkg.purchaseUrl} nativeLink target="_blank" rel="noopener noreferrer" size="sm">
                {t.buyOnShopier}
                <span className="sr-only"> {t.opensInNewTab}</span>
              </Button>
            ) : !pkg.onSale ? (
              <p className="text-xs text-ink-soft">{t.notOnSale}</p>
            ) : null}
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-medium text-navy">{t.howItWorksTitle}</h2>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink-soft">
          {t.howItWorksSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="text-sm text-ink-soft">{t.manualNotice}</p>
      </section>
    </PageContainer>
  );
}
