/**
 * TwoPathAdapter - Bridges new two-path architecture with existing system
 *
 * This adapter allows running BOTH architectures in parallel for comparison:
 * 1. New: calculatePlannedPath + calculateActualPath + findDivergence + renderDualPath
 * 2. Old: tracePhysicalPath + deriveRender
 *
 * DESIGN PRINCIPLE: No modification to existing code.
 * The adapter wraps both systems and compares their outputs.
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { UnifiedPath } from "./types";
import { calculatePlannedPath, type PlannedPath } from "./PlannedPathCalculator";
import { findDivergence, type DivergenceInfo, type PathForComparison } from "./DivergenceDetector";
import { renderDualPath, type RenderSegment, type RenderablePath } from "./DualPathRenderer";
import { tracePhysicalPath } from "./PathBuilder";
import { evaluateBypass } from "./BypassEvaluator";
import { deriveRender } from "./RenderDeriver";

/**
 * Actual path with physics-based waypoints.
 * This is computed using forward ray casting.
 */
export interface ActualPath {
  readonly waypoints: readonly Vector2[];
  readonly cursorIndex: number;
  readonly cursorT: number;
  readonly reachedCursor: boolean;
  readonly blockedBy?: Surface;
}

/**
 * Complete result from both architectures.
 */
export interface TwoPathResult {
  // New architecture outputs
  readonly actual: ActualPath;
  readonly planned: PlannedPath;
  readonly divergence: DivergenceInfo;
  readonly newRenderSegments: RenderSegment[];

  // Old architecture outputs (for comparison)
  readonly unifiedPath: UnifiedPath;
  readonly oldRenderSegments: RenderSegment[];

  // Comparison result
  readonly architecturesMatch: boolean;
}

/**
 * Convert UnifiedPath to waypoints for comparison.
 */
function unifiedPathToWaypoints(path: UnifiedPath): Vector2[] {
  if (path.segments.length === 0) {
    return [];
  }

  const waypoints: Vector2[] = [path.segments[0]!.start];
  for (const segment of path.segments) {
    waypoints.push(segment.end);
  }
  return waypoints;
}

/**
 * Convert PlannedPath to RenderablePath for rendering.
 */
function plannedToRenderable(planned: PlannedPath): RenderablePath {
  return {
    waypoints: planned.waypoints,
    cursorIndex: planned.cursorIndex,
    cursorT: planned.cursorT,
  };
}

/**
 * Convert ActualPath to RenderablePath for rendering.
 */
function actualToRenderable(actual: ActualPath): RenderablePath {
  return {
    waypoints: actual.waypoints,
    cursorIndex: actual.cursorIndex,
    cursorT: actual.cursorT,
  };
}

/**
 * Calculate actual path using forward physics.
 * This wraps tracePhysicalPath to extract just the waypoints.
 */
function calculateActualPath(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[]
): ActualPath {
  const bypassResult = evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);
  const unifiedPath = tracePhysicalPath(player, cursor, bypassResult, allSurfaces);

  // Extract waypoints from unified path
  const waypoints = unifiedPathToWaypoints(unifiedPath);

  // Find cursor position on path
  let cursorIndex = unifiedPath.cursorSegmentIndex;
  let cursorT = unifiedPath.cursorT;

  // If cursor not on path, estimate from waypoints
  if (cursorIndex < 0 && waypoints.length >= 2) {
    cursorIndex = waypoints.length - 2;
    cursorT = 1;
  }

  return {
    waypoints,
    cursorIndex,
    cursorT,
    reachedCursor: unifiedPath.cursorReachable,
    blockedBy: undefined, // Could extract from unified path if needed
  };
}

/**
 * Compare two render segment arrays.
 */
function compareRenderSegments(
  a: readonly RenderSegment[],
  b: readonly RenderSegment[],
  tolerance: number = 1
): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    const segA = a[i]!;
    const segB = b[i]!;

    if (segA.style !== segB.style || segA.color !== segB.color) {
      return false;
    }

    const startDist = Math.hypot(segA.start.x - segB.start.x, segA.start.y - segB.start.y);
    const endDist = Math.hypot(segA.end.x - segB.end.x, segA.end.y - segB.end.y);

    if (startDist > tolerance || endDist > tolerance) {
      return false;
    }
  }

  return true;
}

/**
 * Compute trajectory using BOTH architectures and compare.
 *
 * This is the main entry point for comparison testing.
 * It runs both the new two-path architecture and the old unified path,
 * then compares their render outputs.
 *
 * @param player Player position
 * @param cursor Cursor position
 * @param plannedSurfaces Surfaces in the plan
 * @param allSurfaces All surfaces in the scene
 * @returns TwoPathResult with outputs from both architectures
 */
export function computeBothArchitectures(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[]
): TwoPathResult {
  // --- New Architecture ---

  // 1. Evaluate bypass
  const bypassResult = evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);
  const activeSurfaces = bypassResult.activeSurfaces;

  // 2. Calculate planned path (using bidirectional images, ignoring obstructions)
  const planned = calculatePlannedPath(player, cursor, activeSurfaces);

  // 3. Calculate actual path (using forward physics)
  const actual = calculateActualPath(player, cursor, plannedSurfaces, allSurfaces);

  // 4. Find divergence
  const actualForComparison: PathForComparison = { waypoints: actual.waypoints };
  const plannedForComparison: PathForComparison = { waypoints: planned.waypoints };
  const divergence = findDivergence(actualForComparison, plannedForComparison);

  // 5. Render using new architecture
  const newRenderSegments = renderDualPath(
    actualToRenderable(actual),
    plannedToRenderable(planned),
    divergence,
    cursor
  );

  // --- Old Architecture ---

  // 1. Trace physical path (unified)
  const unifiedPath = tracePhysicalPath(player, cursor, bypassResult, allSurfaces);

  // 2. Derive render segments
  const oldRenderSegments = deriveRender(unifiedPath, cursor, allSurfaces, activeSurfaces);

  // --- Compare ---
  const architecturesMatch = compareRenderSegments(newRenderSegments, oldRenderSegments);

  return {
    actual,
    planned,
    divergence,
    newRenderSegments,
    unifiedPath,
    oldRenderSegments,
    architecturesMatch,
  };
}

