/**
 * WindowConfig - Configuration for visibility window(s)
 *
 * Supports single windows (umbrella mode) and multiple windows (umbrella hole mode).
 * Uses source-of-truth based geometry with no epsilons or angle calculations.
 *
 * OCP Design: WindowConfig is a discriminated union that can be extended
 * with new window types without modifying existing code.
 */

import type { Vector2, Segment } from "@/trajectory-v2/geometry/types";

// Re-export Segment for backward compatibility
export type { Segment };

// =============================================================================
// TYPES
// =============================================================================

/**
 * Single window configuration.
 * Used for standard umbrella mode.
 */
export interface SingleWindowConfig {
  readonly type: "single";
  readonly segment: Segment;
}

/**
 * Multiple windows configuration.
 * Used for umbrella hole mode (two windows with a gap).
 */
export interface MultiWindowConfig {
  readonly type: "multi";
  readonly segments: readonly Segment[];
}

/**
 * WindowConfig - discriminated union for window configurations.
 * Open for extension: add new types without modifying existing code.
 */
export type WindowConfig = SingleWindowConfig | MultiWindowConfig;

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a single window configuration.
 */
export function createSingleWindow(segment: Segment): SingleWindowConfig {
  return {
    type: "single",
    segment,
  };
}

/**
 * Create a multi-window configuration.
 */
export function createMultiWindow(segments: readonly Segment[]): MultiWindowConfig {
  return {
    type: "multi",
    segments,
  };
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Check if a WindowConfig is a multi-window configuration.
 */
export function isMultiWindow(config: WindowConfig): config is MultiWindowConfig {
  return config.type === "multi";
}

/**
 * Check if a WindowConfig is a single-window configuration.
 */
export function isSingleWindow(config: WindowConfig): config is SingleWindowConfig {
  return config.type === "single";
}

// =============================================================================
// ACCESSORS
// =============================================================================

/**
 * Get all window segments from a WindowConfig.
 * Returns a single-element array for single windows.
 */
export function getWindowSegments(config: WindowConfig): readonly Segment[] {
  if (config.type === "single") {
    return [config.segment];
  }
  return config.segments;
}

// =============================================================================
// WINDOW SPLITTING (Source-of-Truth Based)
// =============================================================================

/**
 * Linear interpolation between two points.
 * Uses exact arithmetic - no floating-point tolerances needed.
 *
 * @param start Start point (t=0)
 * @param end End point (t=1)
 * @param t Interpolation parameter [0, 1]
 * @returns Interpolated point
 */
function lerp(start: Vector2, end: Vector2, t: number): Vector2 {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

/**
 * Split a window segment into two sub-windows with a gap.
 *
 * The gap is defined by fractions along the segment:
 * - gapStartFraction: where the gap begins (0 = segment start, 1 = segment end)
 * - gapEndFraction: where the gap ends
 *
 * This is SOURCE-OF-TRUTH BASED geometry:
 * - No angle calculations (atan2)
 * - No epsilon comparisons
 * - Gap endpoints computed by exact linear interpolation
 * - Provenance preserved: sub-window endpoints trace back to source segment
 *
 * @param segment The original window segment
 * @param gapStartFraction Where the gap starts (0-1)
 * @param gapEndFraction Where the gap ends (0-1)
 * @returns Tuple of [leftWindow, rightWindow]
 */
export function splitWindow(
  segment: Segment,
  gapStartFraction: number,
  gapEndFraction: number
): [Segment, Segment] {
  // Compute gap endpoints via linear interpolation (exact, no epsilon)
  const gapStart = lerp(segment.start, segment.end, gapStartFraction);
  const gapEnd = lerp(segment.start, segment.end, gapEndFraction);

  // Left window: from original start to gap start (PROVENANCE: preserves start)
  const leftWindow: Segment = {
    start: segment.start,
    end: gapStart,
  };

  // Right window: from gap end to original end (PROVENANCE: preserves end)
  const rightWindow: Segment = {
    start: gapEnd,
    end: segment.end,
  };

  return [leftWindow, rightWindow];
}

