/**
 * FullTrajectoryCalculator - Complete trajectory with all 4 sections.
 *
 * The full trajectory calculation:
 * 1. Calculate merged path (where physical and planned agree)
 * 2. If divergence:
 *    a. Physical divergent: Continue physical from divergence point
 *    b. Planned to cursor: Continue planned from divergence to cursor
 *    c. Physical from cursor: Continue physical from cursor
 *
 * This provides all the data needed for rendering:
 * - GREEN solid: merged segments
 * - YELLOW dashed: physicalDivergent
 * - RED solid: plannedToCursor
 * - RED dashed: physicalFromCursor
 */

import type { Surface } from "@/surfaces/Surface";
import {
  type ReflectionCache,
  createReflectionCache,
} from "@/trajectory-v2/geometry/ReflectionCache";
import type { Vector2 } from "@/types";
import type { RangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";
import { createPhysicalStrategy, createPlannedStrategy } from "./HitDetectionStrategy";
import { calculateMergedPath } from "./MergedPathCalculator";
import type { RayPropagator } from "./RayPropagator";
import { type TraceSegment, traceWithStrategy } from "./TracePath";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of full trajectory calculation.
 */
export interface FullTrajectoryResult {
  /** GREEN: Merged path where both strategies agree */
  readonly merged: readonly TraceSegment[];

  /** YELLOW: Physical continuation after divergence */
  readonly physicalDivergent: readonly TraceSegment[];

  /** RED solid: Planned path from divergence to cursor */
  readonly plannedToCursor: readonly TraceSegment[];

  /** RED dashed: Physical continuation from cursor */
  readonly physicalFromCursor: readonly TraceSegment[];

  /** Divergence info */
  readonly divergencePoint: Vector2 | null;
  readonly isFullyAligned: boolean;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Calculate the complete trajectory with all sections.
 *
 * Algorithm:
 * 1. Calculate merged path using calculateMergedPath
 * 2. If fully aligned → only merged, all others empty
 * 3. If diverged:
 *    a. physicalDivergent: trace from divergence with physical strategy
 *    b. plannedToCursor: trace from divergence with planned strategy, stop at cursor
 *    c. physicalFromCursor: trace from cursor with physical strategy
 *
 * @param player Player position
 * @param cursor Cursor position
 * @param plannedSurfaces Surfaces in the shot plan
 * @param allSurfaces All surfaces (including planned)
 * @param cache Optional shared ReflectionCache
 * @returns FullTrajectoryResult with all 4 sections
 */
export function calculateFullTrajectory(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[],
  cache?: ReflectionCache,
  rangeLimitPair?: RangeLimitPair
): FullTrajectoryResult {
  const reflectionCache = cache ?? createReflectionCache();

  // Step 1: Calculate merged path
  const mergedResult = calculateMergedPath(
    player,
    cursor,
    plannedSurfaces,
    allSurfaces,
    reflectionCache,
    rangeLimitPair
  );

  // If fully aligned, we're done
  if (mergedResult.isFullyAligned || mergedResult.reachedCursor) {
    return {
      merged: mergedResult.segments,
      physicalDivergent: [],
      plannedToCursor: [],
      physicalFromCursor: [],
      divergencePoint: null,
      isFullyAligned: true,
    };
  }

  // We have divergence - need to calculate the other sections
  const divergencePoint = mergedResult.divergencePoint!;
  const propagatorAtDivergence = mergedResult.propagatorAtDivergence!;

  // Step 2a: Physical divergent path (continues from divergence)
  // Only if physical can continue (wasn't blocked by a wall)
  const physicalStrategy = createPhysicalStrategy(allSurfaces, { rangeLimit: rangeLimitPair });
  let physicalDivergent: readonly TraceSegment[] = [];

  // Check if the divergence was due to physical hitting a wall
  const physicalHitWall =
    mergedResult.divergenceSurface?.physical &&
    !mergedResult.divergenceSurface.physical.canReflectFrom({
      x: cursor.x - player.x,
      y: cursor.y - player.y,
    });

  if (!physicalHitWall && mergedResult.divergenceSurface?.physical) {
    // Physical hit something reflective - continue from that reflection
    const reflectedPropagator = propagatorAtDivergence.reflectThrough(
      mergedResult.divergenceSurface.physical
    );
    const physicalResult = traceWithStrategy(reflectedPropagator, physicalStrategy, {
      maxReflections: 10,
      maxDistance: 10000,
    });
    physicalDivergent = physicalResult.segments;
  }

  // Step 2b: Planned path to cursor
  // Use the SAME propagatorAtDivergence with continueFromPosition.
  // The propagator has the correct (originImage, targetImage) pair.
  const plannedStrategy = createPlannedStrategy(plannedSurfaces);

  // Trace planned path from divergence to cursor using continueFromPosition
  const plannedToCursorResult = traceWithStrategy(propagatorAtDivergence, plannedStrategy, {
    continueFromPosition: divergencePoint,
    stopAtCursor: cursor,
    maxReflections: 10,
    maxDistance: 10000,
  });

  const plannedToCursor: TraceSegment[] = [...plannedToCursorResult.segments];

  // Step 2c: Physical from cursor
  // Use the propagator from planned tracing (already reflected through planned surfaces).
  // Continue from cursor using continueFromPosition.
  const fromCursorResult = traceWithStrategy(plannedToCursorResult.propagator, physicalStrategy, {
    continueFromPosition: cursor,
    maxReflections: 10,
    maxDistance: 10000,
  });

  return {
    merged: mergedResult.segments,
    physicalDivergent,
    plannedToCursor,
    physicalFromCursor: fromCursorResult.segments,
    divergencePoint,
    isFullyAligned: false,
  };
}

/**
 * Extract arrow waypoints from a FullTrajectoryResult.
 *
 * The arrow follows the actual physical path (green + yellow):
 * - merged segments (solid green before cursor, dashed yellow after)
 * - physicalDivergent segments (dashed yellow after divergence)
 *
 * It does NOT include:
 * - plannedToCursor (red solid) - these are planned, not physical
 * - physicalFromCursor (red dashed) - these continue the planned path
 *
 * @param result The full trajectory result
 * @returns Array of waypoints for the arrow to follow
 */
export function getArrowWaypointsFromFullTrajectory(
  result: FullTrajectoryResult
): Vector2[] {
  const waypoints: Vector2[] = [];

  // Add start of first merged segment (player position)
  if (result.merged.length > 0) {
    waypoints.push(result.merged[0]!.start);
  }

  // Add end of each merged segment
  for (const seg of result.merged) {
    waypoints.push(seg.end);
  }

  // Add end of each physicalDivergent segment
  for (const seg of result.physicalDivergent) {
    waypoints.push(seg.end);
  }

  return waypoints;
}
