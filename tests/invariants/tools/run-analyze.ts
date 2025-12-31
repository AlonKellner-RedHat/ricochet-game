#!/usr/bin/env npx tsx
/**
 * CLI Entry Point: Analyze Failure Report
 *
 * Usage:
 *   npm run invariants:analyze
 *   npm run invariants:analyze -- --compare=previous.json
 *
 * Options:
 *   --compare=FILE    Compare with a previous report
 *   --patterns        Show pattern analysis
 *   --scenes          Show scene impact analysis
 *   --invariants      Show invariant impact analysis
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import type { FailureReport } from "./types";
import {
  extractPatterns,
  compareReports,
  formatPatterns,
  formatComparison,
  analyzeSceneImpact,
  analyzeInvariantImpact,
} from "./analyzer";

// Parse command line arguments
const args = process.argv.slice(2);
const compareWith = args.find((a) => a.startsWith("--compare="))?.split("=")[1];
const showPatterns = args.includes("--patterns") || args.length === 0;
const showScenes = args.includes("--scenes");
const showInvariants = args.includes("--invariants");

// Load latest report
const reportsDir = path.resolve(__dirname, "../reports");
const latestPath = path.resolve(reportsDir, "latest.json");

if (!fs.existsSync(latestPath)) {
  console.error("No report found. Run 'npm run invariants:report' first.");
  process.exit(1);
}

const report: FailureReport = JSON.parse(fs.readFileSync(latestPath, "utf-8"));

console.log(`Analyzing report from: ${report.timestamp}`);
console.log(`Total failures: ${report.summary.failed}`);
console.log("");

// Pattern analysis
if (showPatterns) {
  const patterns = extractPatterns(report);
  console.log(formatPatterns(patterns));
}

// Scene impact
if (showScenes) {
  console.log("=== Scene Impact ===");
  console.log("");
  const sceneImpact = analyzeSceneImpact(report);
  for (const { scene, failureCount, invariants } of sceneImpact) {
    console.log(`${scene}: ${failureCount} failures`);
    console.log(`  Invariants: ${invariants.join(", ")}`);
  }
  console.log("");
}

// Invariant impact
if (showInvariants) {
  console.log("=== Invariant Impact ===");
  console.log("");
  const invariantImpact = analyzeInvariantImpact(report);
  for (const { invariant, failureCount, scenes } of invariantImpact) {
    console.log(`${invariant}: ${failureCount} failures`);
    console.log(`  Scenes: ${scenes.join(", ")}`);
  }
  console.log("");
}

// Comparison with previous report
if (compareWith) {
  const previousPath = path.resolve(reportsDir, compareWith);

  if (!fs.existsSync(previousPath)) {
    console.error(`Previous report not found: ${previousPath}`);
    process.exit(1);
  }

  const previousReport: FailureReport = JSON.parse(
    fs.readFileSync(previousPath, "utf-8")
  );

  const comparison = compareReports(previousReport, report);
  console.log(formatComparison(comparison));
}

