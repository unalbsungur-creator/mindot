/**
 * `npm run assets:validate-standard` — the Standard card asset gate.
 *
 *   npm run assets:validate-standard                 # runtime assets + candidate report
 *   npm run assets:validate-standard -- a.png b.png  # check specific files as runtime assets
 *
 * Runtime assets are the PNGs under `public/images/standard/web/` — the only
 * Standard artwork the app loads. Each must pass every rule in
 * standardAssetValidation.ts, or the command exits 1.
 *
 * PNGs directly in `public/images/standard/` are designer masters or not-yet-
 * implemented candidates. They are listed with the same measurements (so you
 * can see what a candidate still needs) but never affect the exit code: they
 * aren't loaded by the app. Masters don't belong under `public/` at all —
 * anything there is deployed as a public static file — so each one also gets
 * a note to keep it outside `public/`. This script never edits, moves or
 * deletes any asset.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { validateStandardAssetFile, type AssetReport } from "./standardAssetValidation";

export const RUNTIME_DIR = "public/images/standard/web";
export const CANDIDATE_DIR = "public/images/standard";

function listPngs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
    .map((entry) => path.posix.join(dir, entry.name))
    .sort();
}

function percent(value: number | null): string {
  return value === null ? "–" : `${(value * 100).toFixed(1)}%`;
}

export function formatReport(report: AssetReport, label: string): string {
  const lines = [
    `${report.verdict.padEnd(4)} ${label} ${report.file}${report.needsDesignerExport ? "  [NEEDS-DESIGNER-EXPORT]" : ""}`,
  ];
  if (report.width !== null) {
    lines.push(
      `     ${report.width}×${report.height}, ${report.colorMode}, alpha ${report.hasAlpha ? "yes" : "no"}, ${Math.round((report.bytes ?? 0) / 1024)} KB`,
      `     corner alpha ${report.cornerAlpha!.join("/")}, opaque edge ${percent(report.opaqueEdgeRatio)}, transparent ${percent(report.transparentRatio)}, partial alpha ${percent(report.partialAlphaRatio)}, visible box ${report.visibleBox ? report.visibleBox.join(",") : "none"}`
    );
  }
  for (const failure of report.failures) lines.push(`     ✗ ${failure}`);
  for (const warning of report.warnings) lines.push(`     ! ${warning}`);
  return lines.join("\n");
}

/** Returns the process exit code: 1 if any runtime asset fails, else 0. */
export function runStandardAssetGate(args: string[], log: (line: string) => void = console.log): number {
  const explicit = args.filter((arg) => !arg.startsWith("-"));
  const runtimeFiles = explicit.length > 0 ? explicit : listPngs(RUNTIME_DIR);

  log(explicit.length > 0 ? "Standard card assets (files given):" : `Runtime Standard card assets (${RUNTIME_DIR}):`);
  if (runtimeFiles.length === 0) log("     (none)");
  const runtimeReports = runtimeFiles.map((file) => validateStandardAssetFile(file));
  for (const report of runtimeReports) log(formatReport(report, "[runtime]"));

  if (explicit.length === 0) {
    const candidates = listPngs(CANDIDATE_DIR);
    if (candidates.length > 0) {
      log(`\nMasters / candidates in ${CANDIDATE_DIR} (not loaded by the app — report only, no effect on the exit code):`);
      for (const file of candidates) {
        log(formatReport(validateStandardAssetFile(file), "[candidate]"));
        log(`     ! not a runtime asset: anything under public/ is deployed publicly — keep masters outside public/; ship only an optimized copy in ${RUNTIME_DIR}`);
      }
    }
  }

  const failed = runtimeReports.filter((report) => report.verdict === "FAIL");
  log(
    failed.length === 0
      ? `\n✓ ${runtimeReports.length} runtime asset(s) checked, none failed.`
      : `\n✗ ${failed.length} of ${runtimeReports.length} runtime asset(s) failed.`
  );
  return failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  process.exit(runStandardAssetGate(process.argv.slice(2)));
}
