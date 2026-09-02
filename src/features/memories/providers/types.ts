/**
 * Provider-neutral abstraction over "how a digital access code comes to
 * exist." A real integration (Shoppier webhook/API) would issue a code the
 * moment a sale completes; see providers/manualProvider.ts for the only
 * implementation that exists today.
 */
export interface DigitalPurchaseProvider {
  name: string;
  issueAccessCode(input: { expiresInDays?: number; reference?: string }): Promise<{ code: string }>;
}
