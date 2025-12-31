/**
 * Failure Analyzer
 *
 * Analyzes failure reports to identify patterns, group similar failures,
 * and track investigation progress.
 */

import type {
  Failure,
  FailureReport,
  FailurePattern,
  ReportComparison,
  PatternStatus,
} from "./types";

// =============================================================================
// PATTERN EXTRACTION
// =============================================================================

/**
 * Extract patterns from a failure report.
 */
export function extractPatterns(report: FailureReport): FailurePattern[] {
  const patternMap = new Map<string, FailurePattern>();

  for (const failure of report.failures) {
    const signature = failure.signature ?? "unknown";

    if (!patternMap.has(signature)) {
      patternMap.set(signature, {
        id: `P${String(patternMap.size + 1).padStart(3, "0")}`,
        signature,
        description: describePattern(signature),
        matchCount: 0,
        examples: [],
        status: "open",
      });
    }

    const pattern = patternMap.get(signature)!;
    pattern.matchCount++;

    // Keep first few examples
    if (pattern.examples.length < 5) {
      pattern.examples.push(failure);
    }
  }

  // Also include pattern counts from the full report
  for (const [signature, data] of Object.entries(report.byPattern)) {
    if (patternMap.has(signature)) {
      patternMap.get(signature)!.matchCount = data.count;
    }
  }

  return Array.from(patternMap.values()).sort(
    (a, b) => b.matchCount - a.matchCount
  );
}

/**
 * Generate a human-readable description from a pattern signature.
 */
function describePattern(signature: string): string {
  const parts = signature.split(":");

  const invariant = parts[0] ?? "unknown";
  const stage = parts[1] ?? "unknown";
  const edgeType = parts[2] ?? "unknown";

  const descriptions: Record<string, string> = {
    "polygon-edges": "Polygon edge validation",
    "polygon-vertices": "Polygon vertex validation",
    "no-self-intersection": "Self-intersection check",
    "V.5": "Cursor reachability",
    "context": "Context computation",
  };

  const stageDesc = stage === "stage0" ? "direct visibility" : `reflection ${stage}`;
  const edgeDesc: Record<string, string> = {
    "screen-to-surface": "edge from screen corner to surface",
    "involves-screen": "edge involving screen boundary",
    "surface-related": "edge between surfaces",
    other: "other edge issue",
  };

  const invariantDesc = descriptions[invariant] ?? invariant;
  const edgeDescription = edgeDesc[edgeType] ?? edgeType;

  return `${invariantDesc} failure in ${stageDesc}: ${edgeDescription}`;
}

// =============================================================================
// REPORT COMPARISON
// =============================================================================

/**
 * Compare two failure reports to track progress.
 */
export function compareReports(
  previous: FailureReport,
  current: FailureReport
): ReportComparison {
  const previousPatterns = new Set(Object.keys(previous.byPattern));
  const currentPatterns = new Set(Object.keys(current.byPattern));

  const fixed: string[] = [];
  const regressions: string[] = [];
  const remaining: string[] = [];

  for (const pattern of previousPatterns) {
    if (!currentPatterns.has(pattern)) {
      fixed.push(pattern);
    } else {
      remaining.push(pattern);
    }
  }

  for (const pattern of currentPatterns) {
    if (!previousPatterns.has(pattern)) {
      regressions.push(pattern);
    }
  }

  return {
    previousTimestamp: previous.timestamp,
    currentTimestamp: current.timestamp,
    fixed,
    regressions,
    remaining,
    failureCountDelta: current.summary.failed - previous.summary.failed,
  };
}

/**
 * Format comparison for console output.
 */
export function formatComparison(comparison: ReportComparison): string {
  const lines: string[] = [
    "=== Report Comparison ===",
    `Previous: ${comparison.previousTimestamp}`,
    `Current: ${comparison.currentTimestamp}`,
    "",
    `Failure count change: ${comparison.failureCountDelta > 0 ? "+" : ""}${comparison.failureCountDelta}`,
    "",
  ];

  if (comparison.fixed.length > 0) {
    lines.push(`Fixed patterns (${comparison.fixed.length}):`);
    for (const pattern of comparison.fixed) {
      lines.push(`  ✓ ${pattern}`);
    }
    lines.push("");
  }

  if (comparison.regressions.length > 0) {
    lines.push(`New regressions (${comparison.regressions.length}):`);
    for (const pattern of comparison.regressions) {
      lines.push(`  ✗ ${pattern}`);
    }
    lines.push("");
  }

  if (comparison.remaining.length > 0) {
    lines.push(`Remaining patterns (${comparison.remaining.length}):`);
    for (const pattern of comparison.remaining) {
      lines.push(`  - ${pattern}`);
    }
  }

  return lines.join("\n");
}

// =============================================================================
// PATTERN ANALYSIS
// =============================================================================

/**
 * Analyze patterns to suggest investigation priorities.
 */
export function prioritizePatterns(patterns: FailurePattern[]): FailurePattern[] {
  // Sort by:
  // 1. Status (open first)
  // 2. Match count (higher first)
  return [...patterns].sort((a, b) => {
    const statusOrder: Record<PatternStatus, number> = {
      open: 0,
      investigating: 1,
      fixed: 2,
      "wont-fix": 3,
    };

    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;

    return b.matchCount - a.matchCount;
  });
}

/**
 * Get a summary of pattern statuses.
 */
export function getPatternStatusSummary(
  patterns: FailurePattern[]
): Record<PatternStatus, number> {
  const summary: Record<PatternStatus, number> = {
    open: 0,
    investigating: 0,
    fixed: 0,
    "wont-fix": 0,
  };

  for (const pattern of patterns) {
    summary[pattern.status]++;
  }

  return summary;
}

/**
 * Format patterns for console output.
 */
export function formatPatterns(patterns: FailurePattern[]): string {
  const lines: string[] = ["=== Failure Patterns ===", ""];

  const statusSummary = getPatternStatusSummary(patterns);
  lines.push(
    `Total: ${patterns.length} patterns ` +
      `(${statusSummary.open} open, ${statusSummary.investigating} investigating, ` +
      `${statusSummary.fixed} fixed, ${statusSummary["wont-fix"]} won't fix)`,
    ""
  );

  for (const pattern of prioritizePatterns(patterns)) {
    const statusIcon: Record<PatternStatus, string> = {
      open: "○",
      investigating: "◐",
      fixed: "●",
      "wont-fix": "⊘",
    };

    lines.push(`${statusIcon[pattern.status]} ${pattern.id}: ${pattern.signature}`);
    lines.push(`  ${pattern.description}`);
    lines.push(`  Count: ${pattern.matchCount} failures`);

    if (pattern.examples.length > 0) {
      const ex = pattern.examples[0]!;
      lines.push(
        `  Example: scene=${ex.scene} player=(${Math.round(ex.player.x)},${Math.round(ex.player.y)})`
      );
    }

    lines.push("");
  }

  return lines.join("\n");
}

// =============================================================================
// SCENE ANALYSIS
// =============================================================================

/**
 * Identify which scenes are most affected.
 */
export function analyzeSceneImpact(
  report: FailureReport
): Array<{ scene: string; failureCount: number; invariants: string[] }> {
  const sceneData = Object.entries(report.byScene)
    .map(([scene, data]) => ({
      scene,
      failureCount: data.count,
      invariants: data.items,
    }))
    .sort((a, b) => b.failureCount - a.failureCount);

  return sceneData;
}

/**
 * Identify which invariants fail most.
 */
export function analyzeInvariantImpact(
  report: FailureReport
): Array<{ invariant: string; failureCount: number; scenes: string[] }> {
  const invariantData = Object.entries(report.byInvariant)
    .map(([invariant, data]) => ({
      invariant,
      failureCount: data.count,
      scenes: data.items,
    }))
    .sort((a, b) => b.failureCount - a.failureCount);

  return invariantData;
}

