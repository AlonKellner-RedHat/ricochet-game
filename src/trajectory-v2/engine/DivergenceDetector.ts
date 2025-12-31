/**
 * DivergenceDetector - Compares two paths and finds divergence point
 *
 * FIRST PRINCIPLES (from principles-audit.md):
 * - A3: Both paths share a common prefix (aligned section)
 * - A4: Paths may diverge at exactly ONE point
 *
 * DESIGN PRINCIPLE: This is a pure comparison function.
 * It takes two independently-calculated paths and finds where they differ.
 * No path calculation happens here - just comparison.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";

/**
 * Minimal path interface for divergence detection.
 * Only waypoints are needed for comparison.
 */
export interface PathForComparison {
  readonly waypoints: readonly Vector2[];
}

/**
 * Result of divergence detection.
 *
 * INVARIANT: There is exactly ONE divergence point (or none if aligned).
 */
export interface DivergenceInfo {
  /** Index of first divergent segment (-1 if fully aligned) */
  readonly segmentIndex: number;
  /** Exact point where paths diverge (last shared waypoint) */
  readonly point: Vector2 | null;
  /** True if paths are identical */
  readonly isAligned: boolean;
}

/**
 * Calculate distance between two points.
 */
function distance(a: Vector2, b: Vector2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Find where two paths diverge.
 *
 * FIRST PRINCIPLES:
 * - A3: Paths share a common prefix
 * - A4: Exactly one divergence point
 *
 * Algorithm:
 * 1. Compare waypoints sequentially
 * 2. Find first mismatch (exact comparison)
 * 3. Return the divergence point (last shared waypoint)
 *
 * @param actual The actual physical path
 * @param planned The ideal planned path
 * @returns DivergenceInfo with divergence point
 */
export function findDivergence(
  actual: PathForComparison,
  planned: PathForComparison
): DivergenceInfo {
  const actualWaypoints = actual.waypoints;
  const plannedWaypoints = planned.waypoints;

  // Edge case: empty paths
  if (actualWaypoints.length === 0 && plannedWaypoints.length === 0) {
    return {
      segmentIndex: -1,
      point: null,
      isAligned: true,
    };
  }

  // Edge case: one path is empty
  if (actualWaypoints.length === 0 || plannedWaypoints.length === 0) {
    return {
      segmentIndex: 0,
      point: null,
      isAligned: false,
    };
  }

  // Compare waypoints sequentially
  const minLength = Math.min(actualWaypoints.length, plannedWaypoints.length);

  for (let i = 0; i < minLength; i++) {
    const actualPoint = actualWaypoints[i]!;
    const plannedPoint = plannedWaypoints[i]!;

    // Exact comparison - points must match exactly
    if (actualPoint.x !== plannedPoint.x || actualPoint.y !== plannedPoint.y) {
      // Found divergence at waypoint i
      // This means segment (i-1 to i) or (i to i+1) diverges
      // The divergence point is the last SHARED waypoint (i-1)
      if (i === 0) {
        // First waypoint differs - divergence at start
        return {
          segmentIndex: 0,
          point: actualPoint, // Use actual's start point
          isAligned: false,
        };
      }

      return {
        segmentIndex: i, // Segment i is where divergence occurs
        point: actualWaypoints[i - 1]!, // Last shared waypoint
        isAligned: false,
      };
    }
  }

  // All compared waypoints match - check lengths
  if (actualWaypoints.length !== plannedWaypoints.length) {
    // Paths have different lengths - divergence at end of shorter path
    const divergeIndex = minLength - 1;
    return {
      segmentIndex: divergeIndex < 0 ? 0 : divergeIndex,
      point: actualWaypoints[divergeIndex] ?? null,
      isAligned: false,
    };
  }

  // All waypoints match and same length - fully aligned
  return {
    segmentIndex: -1,
    point: null,
    isAligned: true,
  };
}

