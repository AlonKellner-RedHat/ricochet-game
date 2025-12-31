/**
 * TwoPathAdapter - Bridges new two-path architecture with existing system
 *
 * @deprecated This module is deprecated. Use SimpleTrajectoryCalculator instead.
 * This module is kept for backward compatibility with existing tests.
 *
 * This adapter allows running BOTH architectures in parallel for comparison:
 * 1. New: calculatePlannedPath + calculateActualPath + findDivergence + renderDualPath
 * 2. Old: tracePhysicalPath + deriveRender
 *
 * DESIGN PRINCIPLE: The new architecture is now the primary path.
 * The old architecture is kept for comparison during migration.
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { UnifiedPath } from "./types";
import { calculatePlannedPath, type PlannedPath } from "./PlannedPathCalculator";
import { 
  calculateActualPath as calculateActualPathPure, 
  getInitialDirection,
  type ActualPath 
} from "./ActualPathCalculator";
import { findDivergence, type DivergenceInfo, type PathForComparison } from "./DivergenceDetector";
import { renderDualPath, type RenderSegment, type RenderablePath } from "./DualPathRenderer";
import { tracePhysicalPath } from "./PathBuilder";
import { evaluateBypass } from "./BypassEvaluator";
import { deriveRender } from "./RenderDeriver";
import { 
  buildBackwardImages, 
  buildForwardImages,
  getCursorImageForSurface,
  getPlayerImageForSurface 
} from "./ImageCache";

// Re-export ActualPath from the new calculator
export type { ActualPath } from "./ActualPathCalculator";

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
 * Calculate initial direction using bidirectional images.
 * 
 * Both planned and actual paths share the same initial direction,
 * derived from cursor images reflected through active surfaces.
 */
function getInitialDirectionFromSurfaces(
  player: Vector2,
  cursor: Vector2,
  activeSurfaces: readonly Surface[]
): Vector2 {
  if (activeSurfaces.length === 0) {
    // No surfaces - direct toward cursor
    return getInitialDirection(player, cursor);
  }

  // Build image sequences
  const playerImages = buildForwardImages(player, activeSurfaces);
  const cursorImages = buildBackwardImages(cursor, activeSurfaces);

  // Get cursor image for first surface (index 0)
  const cursorImage = getCursorImageForSurface(playerImages, cursorImages, 0);

  return getInitialDirection(player, cursorImage);
}

/**
 * Calculate actual path using PURE forward physics.
 * 
 * NEW ARCHITECTURE: Uses ActualPathCalculator directly.
 * No dependency on tracePhysicalPath or UnifiedPath.
 */
function calculateActualPath(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[]
): ActualPath {
  // 1. Evaluate bypass to get active surfaces
  const bypassResult = evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);
  const activeSurfaces = bypassResult.activeSurfaces;

  // 2. Calculate initial direction (shared with planned path)
  const initialDirection = getInitialDirectionFromSurfaces(player, cursor, activeSurfaces);

  // 3. Calculate actual path using pure forward physics
  return calculateActualPathPure(
    player,
    cursor,
    initialDirection,
    allSurfaces
  );
}

/**
 * Compare two render segment arrays.
 */
function compareRenderSegments(
  a: readonly RenderSegment[],
  b: readonly RenderSegment[]
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

    // Exact equality check
    if (segA.start.x !== segB.start.x || segA.start.y !== segB.start.y ||
        segA.end.x !== segB.end.x || segA.end.y !== segB.end.y) {
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

