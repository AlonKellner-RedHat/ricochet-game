/**
 * Failure Report Generator
 *
 * Runs invariant tests and generates a structured failure report.
 * The report can be used for analysis, tracking progress, and investigation.
 */

import { ALL_SCENES } from "../scenes";
import { ALL_POSITIONS, positionKey } from "../positions";
import { ALL_INVARIANTS } from "../invariants";
import { computeContext, DEFAULT_SCREEN_BOUNDS } from "../runner";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type {
  Failure,
  FailureReport,
  TestSummary,
  FailureCount,
} from "./types";

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Maximum number of detailed failures to include in report */
const MAX_DETAILED_FAILURES = 100;

/** Maximum number of commands to include */
const MAX_COMMANDS = 20;

/** Sample rate for positions (1 = all, 4 = every 4th) */
const SAMPLE_RATE = 4;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if player and cursor are too close.
 */
function arePositionsTooClose(player: Vector2, cursor: Vector2): boolean {
  const dx = player.x - cursor.x;
  const dy = player.y - cursor.y;
  return dx * dx + dy * dy < 100;
}

/**
 * Check if position is within screen bounds.
 */
function isWithinBounds(pos: Vector2): boolean {
  return (
    pos.x >= DEFAULT_SCREEN_BOUNDS.minX &&
    pos.x <= DEFAULT_SCREEN_BOUNDS.maxX &&
    pos.y >= DEFAULT_SCREEN_BOUNDS.minY &&
    pos.y <= DEFAULT_SCREEN_BOUNDS.maxY
  );
}

/**
 * Extract stage index from error message.
 */
function extractStageIndex(message: string): number {
  const match = message.match(/Stage (\d+)/);
  return match ? parseInt(match[1]!, 10) : 0;
}

/**
 * Extract failure signature for grouping.
 */
export function extractSignature(failure: Failure): string {
  // Pattern: invariantId:stageN:edgeType
  const parts = [failure.invariantId, `stage${failure.stageIndex}`];

  // Try to categorize the edge type from message
  if (failure.message.includes("screen")) {
    if (failure.message.includes("to surface") || failure.message.includes("from (1280") || failure.message.includes("from (0,")) {
      parts.push("screen-to-surface");
    } else {
      parts.push("involves-screen");
    }
  } else if (failure.message.includes("surface")) {
    parts.push("surface-related");
  } else {
    parts.push("other");
  }

  return parts.join(":");
}

/**
 * Format a failure as a copy-paste command.
 */
function formatCommand(failure: Failure): string {
  const px = Math.round(failure.player.x);
  const py = Math.round(failure.player.y);
  const cx = Math.round(failure.cursor.x);
  const cy = Math.round(failure.cursor.y);
  return `INVARIANT_FOCUS_SCENE=${failure.scene} INVARIANT_FOCUS_PLAYER=${px},${py} INVARIANT_FOCUS_CURSOR=${cx},${cy} npm test -- tests/invariants/`;
}

// =============================================================================
// REPORT GENERATION
// =============================================================================

/**
 * Run all invariant tests and collect failures.
 */
export function collectFailures(sampleRate: number = SAMPLE_RATE): {
  failures: Failure[];
  summary: TestSummary;
} {
  const startTime = Date.now();
  const failures: Failure[] = [];
  let totalCases = 0;
  let passed = 0;
  let skipped = 0;

  const positions = ALL_POSITIONS.filter((_, i) => i % sampleRate === 0);

  for (const scene of ALL_SCENES) {
    for (const player of positions) {
      if (!isWithinBounds(player)) {
        skipped++;
        continue;
      }

      for (const cursor of positions) {
        if (!isWithinBounds(cursor)) {
          skipped++;
          continue;
        }

        if (arePositionsTooClose(player, cursor)) {
          skipped++;
          continue;
        }

        // Compute context
        let context;
        try {
          context = computeContext(scene, player, cursor);
        } catch (error) {
          totalCases++;
          failures.push({
            scene: scene.name,
            player,
            cursor,
            invariantId: "context",
            stageIndex: 0,
            message: `Context computation failed: ${error}`,
          });
          continue;
        }

        // Check each invariant
        for (const invariant of ALL_INVARIANTS) {
          totalCases++;

          try {
            invariant.assert(context);
            passed++;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const failure: Failure = {
              scene: scene.name,
              player,
              cursor,
              invariantId: invariant.id,
              stageIndex: extractStageIndex(message),
              message,
            };
            failure.signature = extractSignature(failure);
            failures.push(failure);
          }
        }
      }
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    failures,
    summary: {
      totalCases,
      passed,
      failed: failures.length,
      skipped,
      durationMs,
    },
  };
}

/**
 * Aggregate failures by a key extractor.
 */
function aggregateBy(
  failures: Failure[],
  keyExtractor: (f: Failure) => string,
  itemExtractor: (f: Failure) => string
): Record<string, FailureCount> {
  const result: Record<string, FailureCount> = {};

  for (const failure of failures) {
    const key = keyExtractor(failure);
    const item = itemExtractor(failure);

    if (!result[key]) {
      result[key] = { count: 0, items: [] };
    }

    result[key]!.count++;
    if (!result[key]!.items.includes(item)) {
      result[key]!.items.push(item);
    }
  }

  return result;
}

/**
 * Get unique position pairs from failures.
 */
function getUniqueCommands(failures: Failure[]): string[] {
  const seen = new Set<string>();
  const commands: string[] = [];

  for (const failure of failures) {
    const key = `${failure.scene}:${positionKey(failure.player)}:${positionKey(failure.cursor)}`;
    if (!seen.has(key) && commands.length < MAX_COMMANDS) {
      seen.add(key);
      commands.push(formatCommand(failure));
    }
  }

  return commands;
}

/**
 * Generate a complete failure report.
 */
export function generateReport(sampleRate: number = SAMPLE_RATE): FailureReport {
  const { failures, summary } = collectFailures(sampleRate);

  // Get git commit if available
  let gitCommit: string | undefined;
  try {
    // This would need to be done differently in browser context
    gitCommit = undefined;
  } catch {
    gitCommit = undefined;
  }

  return {
    timestamp: new Date().toISOString(),
    gitCommit,
    summary,
    byInvariant: aggregateBy(
      failures,
      (f) => f.invariantId,
      (f) => f.scene
    ),
    byScene: aggregateBy(
      failures,
      (f) => f.scene,
      (f) => f.invariantId
    ),
    byPattern: aggregateBy(
      failures,
      (f) => f.signature ?? "unknown",
      (f) => f.scene
    ),
    failures: failures.slice(0, MAX_DETAILED_FAILURES),
    commands: getUniqueCommands(failures),
  };
}

/**
 * Format report summary for console output.
 */
export function formatReportSummary(report: FailureReport): string {
  const lines: string[] = [
    "=== Invariant Test Failure Report ===",
    `Generated: ${report.timestamp}`,
    "",
    "Summary:",
    `  Total cases: ${report.summary.totalCases}`,
    `  Passed: ${report.summary.passed}`,
    `  Failed: ${report.summary.failed}`,
    `  Skipped: ${report.summary.skipped}`,
    `  Duration: ${report.summary.durationMs}ms`,
    "",
  ];

  if (report.summary.failed > 0) {
    lines.push("Failures by Invariant:");
    for (const [invariant, data] of Object.entries(report.byInvariant)) {
      lines.push(`  ${invariant}: ${data.count} failures in ${data.items.length} scenes`);
    }
    lines.push("");

    lines.push("Failures by Scene:");
    for (const [scene, data] of Object.entries(report.byScene)) {
      lines.push(`  ${scene}: ${data.count} failures`);
    }
    lines.push("");

    lines.push("Failures by Pattern:");
    for (const [pattern, data] of Object.entries(report.byPattern)) {
      lines.push(`  ${pattern}: ${data.count} failures`);
    }
    lines.push("");

    lines.push("Investigation Commands (first few):");
    for (const cmd of report.commands.slice(0, 5)) {
      lines.push(`  ${cmd}`);
    }
    if (report.commands.length > 5) {
      lines.push(`  ... and ${report.commands.length - 5} more`);
    }
  } else {
    lines.push("All tests passed!");
  }

  return lines.join("\n");
}

