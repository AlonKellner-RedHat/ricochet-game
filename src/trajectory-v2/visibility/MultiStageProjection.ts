/**
 * MultiStageProjection - Multi-Stage Visibility Propagation
 *
 * This module orchestrates visibility propagation through multiple planned surfaces,
 * implementing the first principle:
 * "Light that is reflected through a surface must have first reached that surface."
 *
 * Algorithm:
 * 1. Project full cone from player (Stage 0)
 * 2. Deduce which portions of the first planned surface are reached
 * 3. For each reached portion (window), create a reflected cone
 * 4. Project each reflected cone to create reflected visibility polygons
 * 5. Repeat for subsequent planned surfaces
 *
 * Key Design Decisions:
 * - Reuses ConeProjectionV2 for all visibility calculations (epsilon-free)
 * - Uses SectorDeduction for provenance-based window detection
 * - Progressive opacity: earlier stages are more transparent
 */

import type { Surface } from "@/surfaces/Surface";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import type { SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  createFullCone,
  createConeThroughWindow,
  projectConeV2,
  toVector2Array,
  computeSurfaceOrientation,
} from "./ConeProjectionV2";
import type { ScreenBounds } from "./ConePropagator";
import { preparePolygonForRendering } from "./RenderingDedup";
import { deduceReflectionWindows, type ReflectionWindow } from "./SectorDeduction";

// =============================================================================
// Reflective Side Check
// =============================================================================

/**
 * Check if a point is on the reflective side of a surface.
 *
 * Uses the established SurfaceOrientation cross product calculation.
 * Mathematical equivalence: 
 *   (start→end) × (start→point) = (start-point) × (end-point)
 * 
 * Both equal: S×E - S×O - O×E (where S=start, E=end, O=origin/point)
 *
 * Cross product sign interpretation:
 * - Positive: point is on the LEFT (reflective) side = normal side
 * - Negative: point is on the RIGHT (non-reflective) side
 * - Zero: point is exactly on the surface line
 *
 * @param origin The origin point to check
 * @param surface The surface to check against
 * @returns true if the origin is on the reflective (front) side
 */
function isOnReflectiveSide(origin: Vector2, surface: Surface): boolean {
  // Use the established SurfaceOrientation cross product
  const orientation = computeSurfaceOrientation(surface, origin);
  
  // Positive cross product = origin is on the reflective (left/normal) side
  return orientation.crossProduct > 0;
}

// =============================================================================
// Types
// =============================================================================

/**
 * A single stage in the visibility propagation.
 *
 * Each stage represents the visibility from a specific origin:
 * - Stage 0 (surfaceIndex = -1): Initial visibility from player
 * - Stage N: Visibility after reflecting through the Nth planned surface
 *
 * When an obstruction splits light into multiple windows, multiple stages
 * share the same surfaceIndex but have different windowIndex values.
 */
export interface PropagationStage {
  /** Origin for this stage's visibility (player or reflected image) */
  readonly origin: Vector2;
  /** The visibility polygon for this stage */
  readonly polygon: Vector2[];
  /** Index of the planned surface this stage reflects through (-1 for initial) */
  readonly surfaceIndex: number;
  /** Index of the window within this surface (0 for initial, 0+ for reflected) */
  readonly windowIndex: number;
  /** Opacity for this stage (0-1, later stages are more opaque) */
  readonly opacity: number;
}

/**
 * Result of multi-stage visibility propagation.
 */
export interface PropagationResult {
  /** All propagation stages */
  readonly stages: PropagationStage[];
  /** Whether the propagation produced at least one valid polygon */
  readonly isValid: boolean;
}

// =============================================================================
// Core Algorithm
// =============================================================================

/**
 * Internal type for tracking current polygons during propagation.
 */
interface CurrentPolygon {
  readonly vertices: SourcePoint[];
  readonly origin: Vector2;
}

/**
 * Propagate visibility through multiple planned surfaces.
 *
 * Implements multi-stage visibility with progressive opacity.
 * Each stage's opacity is calculated to make earlier stages more transparent,
 * emphasizing the final destination.
 *
 * When obstructions split light into multiple windows, each window creates
 * a separate reflected polygon. All polygons are aggregated for subsequent
 * surface calculations.
 *
 * @param player Player position
 * @param plannedSurfaces Ordered list of planned surfaces (windows)
 * @param allSurfaces All surfaces in the scene (including planned)
 * @param bounds Screen boundaries
 * @returns Propagation result with all stages
 */
export function propagateVisibility(
  player: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[],
  bounds: ScreenBounds
): PropagationResult {
  const stages: PropagationStage[] = [];
  const totalStages = plannedSurfaces.length + 1;

  // Stage 0: Full cone visibility from player
  const initialCone = createFullCone(player);
  const initialVertices = projectConeV2(initialCone, allSurfaces, bounds);
  const initialPolygon = preparePolygonForRendering(toVector2Array(initialVertices));

  stages.push({
    origin: player,
    polygon: initialPolygon,
    surfaceIndex: -1,
    windowIndex: 0,
    opacity: calculateStageOpacity(0, totalStages),
  });

  if (plannedSurfaces.length === 0) {
    // No planned surfaces - just return initial stage with full opacity
    stages[0] = { ...stages[0]!, opacity: 1.0 };
    return { stages, isValid: initialPolygon.length >= 3 };
  }

  // Track current polygons for aggregation across windows
  let currentPolygons: CurrentPolygon[] = [{ vertices: initialVertices, origin: player }];

  // Process each planned surface
  for (let i = 0; i < plannedSurfaces.length; i++) {
    const plannedSurface = plannedSurfaces[i]!;

    // All current origins should be the same (reflected through same surfaces)
    // Use the first one for the reflective side check
    const currentOrigin = currentPolygons[0]?.origin ?? player;

    // Check if origin is on the reflective side of this surface
    // Light can only reflect from the front side of a surface
    const onReflectiveSide = isOnReflectiveSide(currentOrigin, plannedSurface);
    if (!onReflectiveSide) {
      // Origin is on the back side - no reflection possible
      // Stop propagation for this chain
      break;
    }

    // Aggregate windows from ALL current polygons
    const allWindows: ReflectionWindow[] = [];
    for (const polygon of currentPolygons) {
      const windows = deduceReflectionWindows(polygon.vertices, plannedSurface);
      allWindows.push(...windows);
    }

    if (allWindows.length === 0) {
      // Surface is completely blocked - stop propagation
      break;
    }

    // Merge adjacent/overlapping windows to avoid duplicates
    const mergedWindows = mergeAdjacentWindows(allWindows, plannedSurface);

    // Reflect origin through this surface
    const reflectedOrigin = reflectPointThroughLine(
      currentOrigin,
      plannedSurface.segment.start,
      plannedSurface.segment.end
    );

    // Create a reflected polygon for EACH window
    const nextPolygons: CurrentPolygon[] = [];
    const stageOpacity = calculateStageOpacity(i + 1, totalStages);

    for (let windowIdx = 0; windowIdx < mergedWindows.length; windowIdx++) {
      const window = mergedWindows[windowIdx]!;
      
      const reflectedCone = createConeThroughWindow(
        reflectedOrigin,
        window.start,
        window.end
      );

      // Project the reflected cone
      // Exclude the planned surface from obstacles (it's the window)
      const reflectedVertices = projectConeV2(
        reflectedCone,
        allSurfaces,
        bounds,
        plannedSurface.id
      );
      const reflectedPolygon = preparePolygonForRendering(toVector2Array(reflectedVertices));

      // Only add if polygon is valid
      if (reflectedPolygon.length >= 3) {
        stages.push({
          origin: reflectedOrigin,
          polygon: reflectedPolygon,
          surfaceIndex: i,
          windowIndex: windowIdx,
          opacity: stageOpacity,
        });

        nextPolygons.push({ vertices: reflectedVertices, origin: reflectedOrigin });
      }
    }

    // Update for next iteration - all new polygons become current
    if (nextPolygons.length === 0) {
      // No valid polygons produced - stop propagation
      break;
    }
    currentPolygons = nextPolygons;
  }

  // Check if we have at least one valid polygon
  const isValid = stages.some((s) => s.polygon.length >= 3);

  return { stages, isValid };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate opacity for a stage based on its position in the chain.
 *
 * Later stages (closer to final destination) are more opaque.
 * Formula: opacity = (stageIndex + 1) / totalStages
 *
 * Examples (5 surfaces = 6 stages):
 * - Stage 0 (initial): 1/6 ≈ 0.17
 * - Stage 5 (final): 6/6 = 1.0
 */
function calculateStageOpacity(stageIndex: number, totalStages: number): number {
  if (totalStages <= 1) {
    return 1.0;
  }
  return (stageIndex + 1) / totalStages;
}

/**
 * Merge adjacent or overlapping windows on a surface.
 *
 * When multiple polygons contribute windows to the same surface,
 * some windows may overlap or be adjacent. Merging them avoids
 * redundant polygons and ensures consistent behavior.
 *
 * Uses parametric position along the surface for merging decisions.
 * This is provenance-based: windows from the same surface can be
 * compared by their position along the surface line.
 *
 * @param windows All windows from all current polygons
 * @param surface The surface these windows belong to
 * @returns Merged windows (non-overlapping, sorted along surface)
 */
function mergeAdjacentWindows(
  windows: ReflectionWindow[],
  surface: Surface
): ReflectionWindow[] {
  if (windows.length <= 1) {
    return windows;
  }

  // Convert windows to parametric form (t value along surface)
  const surfaceDir = {
    x: surface.segment.end.x - surface.segment.start.x,
    y: surface.segment.end.y - surface.segment.start.y,
  };
  const surfaceLen = Math.sqrt(surfaceDir.x * surfaceDir.x + surfaceDir.y * surfaceDir.y);
  if (surfaceLen < 1e-10) {
    return windows.slice(0, 1); // Degenerate surface
  }

  // Calculate t values for each window endpoint
  interface WindowInterval {
    tStart: number;
    tEnd: number;
    window: ReflectionWindow;
  }

  const intervals: WindowInterval[] = windows.map((w) => {
    const tStart = projectPointOntoLine(w.start, surface);
    const tEnd = projectPointOntoLine(w.end, surface);
    // Ensure tStart <= tEnd
    return tStart <= tEnd
      ? { tStart, tEnd, window: w }
      : { tStart: tEnd, tEnd: tStart, window: w };
  });

  // Sort by start position
  intervals.sort((a, b) => a.tStart - b.tStart);

  // Merge overlapping intervals
  const merged: WindowInterval[] = [];
  let current = intervals[0]!;

  for (let i = 1; i < intervals.length; i++) {
    const next = intervals[i]!;
    // Check if overlapping or adjacent (with small tolerance for floating point)
    if (next.tStart <= current.tEnd + 0.001) {
      // Merge: extend current to include next
      current = {
        tStart: current.tStart,
        tEnd: Math.max(current.tEnd, next.tEnd),
        window: current.window, // Keep original window reference
      };
    } else {
      // Gap: push current and start new
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);

  // Convert back to windows with interpolated coordinates
  return merged.map((interval) => ({
    start: interpolateOnSurface(interval.tStart, surface),
    end: interpolateOnSurface(interval.tEnd, surface),
    surface,
  }));
}

/**
 * Project a point onto the surface line and return its parametric t value.
 * t=0 at start, t=1 at end.
 */
function projectPointOntoLine(point: Vector2, surface: Surface): number {
  const { start, end } = surface.segment;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) return 0;

  const px = point.x - start.x;
  const py = point.y - start.y;
  return (px * dx + py * dy) / lenSq;
}

/**
 * Interpolate a point on the surface at parametric position t.
 */
function interpolateOnSurface(t: number, surface: Surface): Vector2 {
  const { start, end } = surface.segment;
  return {
    x: start.x + t * (end.x - start.x),
    y: start.y + t * (end.y - start.y),
  };
}

