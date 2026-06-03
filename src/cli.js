import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { buildSeoInsights } from "./analytics.js";
import { loadReportData } from "./dataLoader.js";
import { renderHtmlReport } from "./renderHtmlReport.js";

dotenv.config();

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = value;
      i += 1;
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  npm run generate -- --source looker --lookerCsvPath samples/gsc-looker-sample.csv --contentCsvPath samples/content-sample.csv
  npm run generate -- --source gsc --siteUrl sc-domain:example.com --startDate 2026-01-01 --endDate 2026-05-27 --keyFile C:\\keys\\gsc.json

Options:
  --source looker|gsc
  --siteUrl <string>
  --lookerCsvPath <path>
  --contentCsvPath <path>
  --startDate YYYY-MM-DD
  --endDate YYYY-MM-DD
  --searchType web|image|video|news
  --keyFile <path> (or use env GOOGLE_APPLICATION_CREDENTIALS)
  --output <path> (default ./output/seo-report-{timestamp}.html)
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === "true") {
    printHelp();
    return;
  }

  const sourceType = args.source || "looker";

  const input = {
    sourceType,
    siteUrl: args.siteUrl,
    lookerCsvPath: args.lookerCsvPath,
    contentCsvPath: args.contentCsvPath,
    searchType: args.searchType,
    startDate: args.startDate,
    endDate: args.endDate,
    gscKeyFile: args.keyFile || process.env.GOOGLE_APPLICATION_CREDENTIALS,
  };

  const { rows, sourceInfo } = await loadReportData(input);
  const insights = buildSeoInsights({
    rows,
    endDate: input.endDate || sourceInfo.range?.end,
    currentRange: sourceInfo.range,
  });

  const html = renderHtmlReport({
    insights,
    sourceInfo,
  });

  const outputPath = args.output
    ? path.resolve(args.output)
    : path.resolve("output", `seo-report-${Date.now()}.html`);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, html, "utf8");

  console.log(`Report generated: ${outputPath}`);
}

main().catch((error) => {
  console.error("Failed to generate report.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
