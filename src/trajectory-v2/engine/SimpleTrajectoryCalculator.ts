/**
 * SimpleTrajectoryCalculator - The new two-path architecture in one simple interface
 *
 * DESIGN PHILOSOPHY: Make the simple things simple.
 *
 * This combines:
 * 1. calculatePlannedPath - Ideal path using bidirectional images (~50 lines)
 * 2. calculateActualPath - Physical path using forward physics (~80 lines)
 * 3. findDivergence - Compare paths and find ONE divergence point (~40 lines)
 * 4. deriveRenderSegments - Simple color derivation (~50 lines)
 *
 * Total: ~220 lines vs 1400+ lines in PathBuilder + 700 lines in RenderDeriver
 *
 * FIRST PRINCIPLES:
 * - A1: Exactly ONE actual path
 * - A2: Exactly ONE planned path
 * - A3: Paths share a common prefix
 * - A4: Exactly ONE divergence point (or none)
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import type { SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";
import { extractSurfacesFromChains } from "@/trajectory-v2/geometry/RayCasting";
import { type BypassResult } from "./BypassEvaluator";
import { 
  calculateActualPath,
  calculateActualPathWithChains,
  getInitialDirection,
  type ActualPath 
} from "./ActualPathCalculator";
import { type PlannedPath } from "./PlannedPathCalculator";
import { findDivergence, type DivergenceInfo } from "./DivergenceDetector";
import { renderDualPath, type RenderSegment } from "./DualPathRenderer";
import { TrajectoryDebugLogger } from "../TrajectoryDebugLogger";
import {
  evaluateBypassFromChain,
  buildPlannedPathFromChain,
  type ChainBypassResult,
} from "./ImageChain";

/**
 * Complete trajectory result from the simple calculator.
 */
export interface SimpleTrajectoryResult {
  /** The actual physical path (what the arrow does) */
  readonly actual: ActualPath;
  /** The planned ideal path (what we wanted) */
  readonly planned: PlannedPath;
  /** Where paths diverge (if at all) */
  readonly divergence: DivergenceInfo;
  /** Render-ready segments with colors */
  readonly renderSegments: readonly RenderSegment[];
  /** Bypass evaluation result */
  readonly bypass: BypassResult;
  /**
   * Waypoint sources with provenance (from actual path).
   * Contains OriginPoint/HitPoint types for unified type handling.
   */
  readonly waypointSources: readonly SourcePoint[];
}

/**
 * Calculate initial direction using ImageChain.
 * 
 * SHARED: Both planned and actual paths start with the same direction.
 * Uses the cursor image from the ImageChain for consistent direction calculation.
 */
function getSharedInitialDirection(
  player: Vector2,
  cursor: Vector2,
  chainBypass: ChainBypassResult
): Vector2 {
  if (chainBypass.activeSurfaces.length === 0) {
    return getInitialDirection(player, cursor);
  }

  // Use cursor image from ImageChain (depth = number of surfaces)
  const n = chainBypass.chain.surfaces.length;
  const cursorImage = chainBypass.chain.getCursorImage(n);

  return getInitialDirection(player, cursorImage);
}

/**
 * Calculate complete trajectory using the simple two-path architecture.
 *
 * This is the SINGLE entry point for trajectory calculation.
 *
 * Steps:
 * 1. Evaluate bypass (filter surfaces)
 * 2. Calculate planned path (ignores obstructions)
 * 3. Calculate actual path (forward physics)
 * 4. Find divergence (compare waypoints)
 * 5. Derive render segments (simple color rules)
 *
 * @param player Player position
 * @param cursor Cursor position
 * @param plannedSurfaces Surfaces in the plan
 * @param allSurfaces All surfaces in the scene
 * @returns Complete trajectory result
 */
export function calculateSimpleTrajectory(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[]
): SimpleTrajectoryResult {
  // Log the input (if debug enabled)
  TrajectoryDebugLogger.logTrajectory(player, cursor, plannedSurfaces, allSurfaces);

  // Step 1: Evaluate bypass using ImageChain (single source of truth)
  const chainBypass = evaluateBypassFromChain(player, cursor, plannedSurfaces);
  
  // Adapt to existing BypassResult interface for compatibility
  const bypass: BypassResult = {
    activeSurfaces: chainBypass.activeSurfaces,
    bypassedSurfaces: chainBypass.bypassedSurfaces,
  };
  TrajectoryDebugLogger.logBypass(bypass);

  // Step 2: Calculate shared initial direction using ImageChain
  const initialDirection = getSharedInitialDirection(player, cursor, chainBypass);

  // Step 3: Calculate planned path from ImageChain (single source of truth)
  const chainPlanned = buildPlannedPathFromChain(chainBypass.chain);
  
  // Adapt to existing PlannedPath interface for compatibility
  const planned: PlannedPath = {
    waypoints: chainPlanned.waypoints,
    waypointSources: chainBypass.chain.getAllWaypointSources(),
    hits: chainPlanned.hits.map(h => ({
      point: h.point,
      surface: h.surface,
      onSegment: h.onSegment,
    })),
    cursorIndex: chainPlanned.cursorIndex,
    cursorT: chainPlanned.cursorT,
  };
  TrajectoryDebugLogger.logPlannedPath(planned);

  // Step 4: Calculate actual path (using forward physics)
  const actual = calculateActualPath(player, cursor, initialDirection, allSurfaces);
  TrajectoryDebugLogger.logActualPath(actual);

  // Step 5: Find divergence (simple waypoint comparison)
  const divergence = findDivergence(
    { waypoints: actual.waypoints },
    { waypoints: planned.waypoints }
  );
  TrajectoryDebugLogger.logDivergence(divergence);

  // Step 6: Derive render segments (simple color rules)
  const renderSegments = renderDualPath(
    {
      waypoints: actual.waypoints,
      cursorIndex: actual.cursorIndex,
      cursorT: actual.cursorT,
    },
    {
      waypoints: planned.waypoints,
      cursorIndex: planned.cursorIndex,
      cursorT: planned.cursorT,
    },
    divergence,
    cursor
  );
  TrajectoryDebugLogger.logRenderSegments(renderSegments);

  return {
    actual,
    planned,
    divergence,
    renderSegments,
    bypass,
    waypointSources: actual.waypointSources,
  };
}

/**
 * Calculate complete trajectory using SurfaceChains.
 *
 * This version uses the unified SurfaceChain[] type shared with
 * the visibility system, enabling provenance tracking and
 * junction handling for aligned behavior.
 *
 * @param player Player position
 * @param cursor Cursor position
 * @param plannedSurfaces Surfaces in the plan
 * @param chains All surface chains in the scene
 * @returns Complete trajectory result
 */
export function calculateSimpleTrajectoryWithChains(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  chains: readonly SurfaceChain[]
): SimpleTrajectoryResult {
  // Extract surfaces for backward-compatible calculation
  const allSurfaces = extractSurfacesFromChains(chains);
  
  // Log the input (if debug enabled)
  TrajectoryDebugLogger.logTrajectory(player, cursor, plannedSurfaces, allSurfaces);

  // Step 1: Evaluate bypass using ImageChain (single source of truth)
  const chainBypass = evaluateBypassFromChain(player, cursor, plannedSurfaces);
  
  // Adapt to existing BypassResult interface for compatibility
  const bypass: BypassResult = {
    activeSurfaces: chainBypass.activeSurfaces,
    bypassedSurfaces: chainBypass.bypassedSurfaces,
  };
  TrajectoryDebugLogger.logBypass(bypass);

  // Step 2: Calculate shared initial direction using ImageChain
  const initialDirection = getSharedInitialDirection(player, cursor, chainBypass);

  // Step 3: Calculate planned path from ImageChain (single source of truth)
  const chainPlanned = buildPlannedPathFromChain(chainBypass.chain);
  
  // Adapt to existing PlannedPath interface for compatibility
  const planned: PlannedPath = {
    waypoints: chainPlanned.waypoints,
    waypointSources: chainBypass.chain.getAllWaypointSources(),
    hits: chainPlanned.hits.map(h => ({
      point: h.point,
      surface: h.surface,
      onSegment: h.onSegment,
    })),
    cursorIndex: chainPlanned.cursorIndex,
    cursorT: chainPlanned.cursorT,
  };
  TrajectoryDebugLogger.logPlannedPath(planned);

  // Step 4: Calculate actual path using chains (forward physics with provenance)
  const actual = calculateActualPathWithChains(player, cursor, initialDirection, chains);
  TrajectoryDebugLogger.logActualPath(actual);

  // Step 5: Find divergence (simple waypoint comparison)
  const divergence = findDivergence(
    { waypoints: actual.waypoints },
    { waypoints: planned.waypoints }
  );
  TrajectoryDebugLogger.logDivergence(divergence);

  // Step 6: Derive render segments (simple color rules)
  const renderSegments = renderDualPath(
    {
      waypoints: actual.waypoints,
      cursorIndex: actual.cursorIndex,
      cursorT: actual.cursorT,
    },
    {
      waypoints: planned.waypoints,
      cursorIndex: planned.cursorIndex,
      cursorT: planned.cursorT,
    },
    divergence,
    cursor
  );
  TrajectoryDebugLogger.logRenderSegments(renderSegments);

  return {
    actual,
    planned,
    divergence,
    renderSegments,
    bypass,
    waypointSources: actual.waypointSources,
  };
}

/**
 * Get arrow waypoints from trajectory result.
 *
 * FIRST PRINCIPLE F1: Arrow follows actual path.
 */
export function getArrowWaypoints(result: SimpleTrajectoryResult): readonly Vector2[] {
  return result.actual.waypoints;
}

/**
 * Check if cursor is reachable.
 *
 * FIRST PRINCIPLE: Cursor is reachable if actual path reaches it.
 */
export function isCursorReachable(result: SimpleTrajectoryResult): boolean {
  return result.actual.reachedCursor;
}

/**
 * Check if paths are fully aligned.
 *
 * FIRST PRINCIPLE: Aligned when divergence.isAligned is true.
 */
export function isFullyAligned(result: SimpleTrajectoryResult): boolean {
  return result.divergence.isAligned;
}

