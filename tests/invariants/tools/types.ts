/**
 * Shared Types for Invariant Testing Tooling
 *
 * These types support the failure investigation workflow:
 * - Report generation
 * - Failure analysis
 * - Hypothesis tracking
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";

// =============================================================================
// FAILURE TYPES
// =============================================================================

/**
 * A single invariant test failure.
 */
export interface Failure {
  /** Scene name */
  scene: string;

  /** Player position */
  player: Vector2;

  /** Cursor position */
  cursor: Vector2;

  /** Invariant ID that failed */
  invariantId: string;

  /** Stage index where failure occurred (0 = player, 1+ = reflections) */
  stageIndex: number;

  /** Human-readable error message */
  message: string;

  /** Raw error details for debugging */
  details?: string;

  /** Computed signature for grouping */
  signature?: string;
}

/**
 * Summary statistics for a test run.
 */
export interface TestSummary {
  /** Total test cases checked */
  totalCases: number;

  /** Number of passing cases */
  passed: number;

  /** Number of failing cases */
  failed: number;

  /** Number of skipped cases */
  skipped: number;

  /** Test duration in milliseconds */
  durationMs: number;
}

// =============================================================================
// REPORT TYPES
// =============================================================================

/**
 * Aggregated failure count by category.
 */
export interface FailureCount {
  /** Number of failures */
  count: number;

  /** Related items (scene names or invariant IDs) */
  items: string[];
}

/**
 * Complete failure report from a test run.
 */
export interface FailureReport {
  /** ISO timestamp of when report was generated */
  timestamp: string;

  /** Git commit hash if available */
  gitCommit?: string;

  /** Test run summary */
  summary: TestSummary;

  /** Failures grouped by invariant ID */
  byInvariant: Record<string, FailureCount>;

  /** Failures grouped by scene name */
  byScene: Record<string, FailureCount>;

  /** Failures grouped by signature pattern */
  byPattern: Record<string, FailureCount>;

  /** Sample failures with full details (first N) */
  failures: Failure[];

  /** Copy-paste commands for investigation */
  commands: string[];
}

// =============================================================================
// PATTERN TYPES
// =============================================================================

/**
 * A failure pattern groups similar failures by their signature.
 */
export interface FailurePattern {
  /** Unique pattern identifier */
  id: string;

  /** Signature string used for matching */
  signature: string;

  /** Human-readable description */
  description: string;

  /** Number of failures matching this pattern */
  matchCount: number;

  /** Example failures (first few) */
  examples: Failure[];

  /** Linked hypothesis ID if any */
  hypothesisId?: string;

  /** Current status */
  status: PatternStatus;

  /** Notes about investigation */
  notes?: string;
}

export type PatternStatus = "open" | "investigating" | "fixed" | "wont-fix";

// =============================================================================
// HYPOTHESIS TYPES
// =============================================================================

/**
 * A hypothesis about why a failure pattern occurs.
 */
export interface Hypothesis {
  /** Unique hypothesis identifier (e.g., "H001") */
  id: string;

  /** Short title */
  title: string;

  /** Detailed description of the hypothesis */
  description: string;

  /** Related failure pattern ID */
  relatedPatternId: string;

  /** Test cases that would confirm/reject this hypothesis */
  testCases: HypothesisTestCase[];

  /** Current status */
  status: HypothesisStatus;

  /** Conclusion after testing */
  conclusion?: string;

  /** Fix applied if confirmed */
  fixDescription?: string;
}

export type HypothesisStatus = "proposed" | "testing" | "confirmed" | "rejected";

/**
 * A specific test case for a hypothesis.
 */
export interface HypothesisTestCase {
  /** Description of what this case tests */
  description: string;

  /** Scene to use (or "custom" for special cases) */
  scene: string;

  /** Player position to test */
  player: Vector2;

  /** Cursor position to test */
  cursor: Vector2;

  /** Expected outcome */
  expectedResult: "pass" | "fail";

  /** Why this case is relevant to the hypothesis */
  rationale: string;
}

// =============================================================================
// ANALYSIS TYPES
// =============================================================================

/**
 * Analysis result comparing two reports.
 */
export interface ReportComparison {
  /** Previous report timestamp */
  previousTimestamp: string;

  /** Current report timestamp */
  currentTimestamp: string;

  /** Patterns that were fixed (in previous, not in current) */
  fixed: string[];

  /** New patterns (in current, not in previous) */
  regressions: string[];

  /** Patterns still present */
  remaining: string[];

  /** Change in total failure count */
  failureCountDelta: number;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Edge categorization for pattern extraction.
 */
export type EdgeCategory =
  | "screen-to-surface" // Edge from screen corner to surface
  | "surface-to-screen" // Edge from surface to screen corner
  | "surface-to-surface" // Edge between two surfaces
  | "ray-from-origin" // Valid ray from origin
  | "unknown"; // Uncategorized

/**
 * Stage information for failure context.
 */
export interface StageInfo {
  /** Stage index */
  index: number;

  /** Surface ID (null for player stage) */
  surfaceId: string | null;

  /** Origin point for this stage */
  origin: Vector2;
}

