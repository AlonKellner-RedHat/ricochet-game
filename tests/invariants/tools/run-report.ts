#!/usr/bin/env npx tsx
/**
 * CLI Entry Point: Generate Failure Report
 *
 * Usage:
 *   npm run invariants:report
 *   npm run invariants:report -- --sample-rate=1
 *
 * Options:
 *   --sample-rate=N   Sample every Nth position (default: 4)
 *   --no-save         Don't save report to file
 *   --quiet           Only output JSON
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { generateReport, formatReportSummary } from "./report-generator";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const sampleRate = parseInt(
  args.find((a) => a.startsWith("--sample-rate="))?.split("=")[1] ?? "4",
  10
);
const noSave = args.includes("--no-save");
const quiet = args.includes("--quiet");

// Directory for reports
const reportsDir = path.resolve(__dirname, "../reports");
const archiveDir = path.resolve(reportsDir, "archive");

// Ensure directories exist
if (!noSave) {
  fs.mkdirSync(archiveDir, { recursive: true });
}

// Generate report
if (!quiet) {
  console.log("Generating failure report...");
  console.log(`Sample rate: ${sampleRate} (use --sample-rate=1 for full coverage)`);
  console.log("");
}

const report = generateReport(sampleRate);

// Output
if (quiet) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatReportSummary(report));
}

// Save to files
if (!noSave) {
  // Save as latest.json
  const latestPath = path.resolve(reportsDir, "latest.json");
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));

  // Archive with timestamp
  const timestamp = report.timestamp.replace(/[:.]/g, "-").slice(0, 19);
  const archivePath = path.resolve(archiveDir, `${timestamp}.json`);
  fs.writeFileSync(archivePath, JSON.stringify(report, null, 2));

  if (!quiet) {
    console.log("");
    console.log(`Report saved to: ${latestPath}`);
    console.log(`Archived to: ${archivePath}`);
  }
}

