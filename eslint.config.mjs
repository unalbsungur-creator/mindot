import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // EPIC: Proper Cloudflare OpenNext Integration and Real Bundle
    // Measurement — .open-next/ is OpenNext's generated Worker bundle
    // output (server-function chunks, cache/asset copies), the same
    // "never lint generated build output" category as .next/ above.
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
