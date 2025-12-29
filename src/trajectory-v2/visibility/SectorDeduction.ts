/**
 * SectorDeduction - Provenance-Based Reflection Window Deduction
 *
 * This module analyzes sorted polygon vertices from ConeProjectionV2 to deduce
 * which portions of a target surface are illuminated (not shadowed by obstacles).
 *
 * First Principle: Light reaching a surface can be deduced from the polygon
 * vertices' provenance (surface.id). If a vertex belongs to the target surface,
 * light reaches that point.
 *
 * Key Design Decisions:
 * - Uses provenance (surface.id) for exact matching - no coordinate comparisons
 * - Epsilon-free: all decisions based on source-of-truth identities
 * - Handles both Endpoints and HitPoints on the target surface
 * - Correctly handles polygon wrap-around (last vertex connects to first)
 */

import type { Surface } from "@/surfaces/Surface";
import type { SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// =============================================================================
// Types
// =============================================================================

/**
 * A reflection window - a portion of a surface that light can reach.
 *
 * When light reaches a surface partially (due to obstacles), multiple
 * windows may exist. Each window can be independently reflected for
 * multi-stage propagation.
 */
export interface ReflectionWindow {
  /** Start point of the window on the surface */
  readonly start: Vector2;
  /** End point of the window on the surface */
  readonly end: Vector2;
  /** The surface this window belongs to */
  readonly surface: Surface;
}

// =============================================================================
// Core Algorithm
// =============================================================================

/**
 * Deduce which portions of a target surface are illuminated.
 *
 * Analyzes the polygon vertices (sorted CCW) and identifies continuous
 * segments that belong to the target surface. Each continuous segment
 * becomes a reflection window.
 *
 * Algorithm:
 * 1. Find all vertices belonging to target surface (by provenance: surface.id)
 * 2. Track continuous runs of target surface vertices
 * 3. When a non-target vertex appears, end the current run
 * 4. Handle wrap-around: if first and last vertices both belong to target,
 *    they might form a single window
 *
 * @param polygonVertices Sorted polygon vertices from ConeProjectionV2 (CCW order)
 * @param targetSurface The surface to find reflection windows for
 * @returns Array of reflection windows (may be empty if surface is blocked)
 */
export function deduceReflectionWindows(
  polygonVertices: SourcePoint[],
  targetSurface: Surface
): ReflectionWindow[] {
  if (polygonVertices.length === 0) {
    return [];
  }

  // Find all indices where vertices belong to the target surface
  const targetIndices: number[] = [];
  for (let i = 0; i < polygonVertices.length; i++) {
    if (isVertexOnSurface(polygonVertices[i]!, targetSurface)) {
      targetIndices.push(i);
    }
  }

  if (targetIndices.length === 0) {
    return [];
  }

  // Group consecutive indices into runs
  const runs = groupConsecutiveIndices(targetIndices, polygonVertices.length);

  // Convert runs to windows
  const windows: ReflectionWindow[] = [];
  for (const run of runs) {
    const window = runToWindow(run, polygonVertices, targetSurface);
    if (window) {
      windows.push(window);
    }
  }

  return windows;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a vertex belongs to a specific surface using provenance.
 * Uses surface.id for exact matching - no coordinate comparisons.
 */
function isVertexOnSurface(vertex: SourcePoint, surface: Surface): boolean {
  // Use the built-in isOnSurface method which handles provenance correctly
  return vertex.isOnSurface(surface);
}

/**
 * Group consecutive indices into runs, handling wrap-around.
 *
 * Example: indices [0, 1, 5, 6, 7] with length 8
 * - Run 1: [5, 6, 7]
 * - Run 2: [0, 1] (wraps to beginning)
 * - If indices[0] and indices[last] are adjacent via wrap, merge them
 */
function groupConsecutiveIndices(indices: number[], totalLength: number): number[][] {
  if (indices.length === 0) {
    return [];
  }

  if (indices.length === 1) {
    return [[indices[0]!]];
  }

  const runs: number[][] = [];
  let currentRun: number[] = [indices[0]!];

  for (let i = 1; i < indices.length; i++) {
    const prevIdx = indices[i - 1]!;
    const currIdx = indices[i]!;

    // Check if consecutive (allowing for gaps of 1)
    if (currIdx === prevIdx + 1) {
      currentRun.push(currIdx);
    } else {
      // Gap detected - start new run
      runs.push(currentRun);
      currentRun = [currIdx];
    }
  }
  runs.push(currentRun);

  // Handle wrap-around: if last and first indices are adjacent via wrap
  if (runs.length >= 2) {
    const firstRun = runs[0]!;
    const lastRun = runs[runs.length - 1]!;

    // Check if last index + 1 === totalLength AND first index === 0
    const lastIdx = lastRun[lastRun.length - 1]!;
    const firstIdx = firstRun[0]!;

    if (lastIdx === totalLength - 1 && firstIdx === 0) {
      // Merge last run with first run (last run comes first in the merged result)
      const mergedRun = [...lastRun, ...firstRun];
      runs.pop(); // Remove last run
      runs.shift(); // Remove first run
      runs.unshift(mergedRun); // Add merged run at beginning
    }
  }

  return runs;
}

/**
 * Convert a run of indices to a ReflectionWindow.
 *
 * The window's start and end are the coordinates of the first and last
 * vertices in the run.
 */
function runToWindow(
  run: number[],
  vertices: SourcePoint[],
  surface: Surface
): ReflectionWindow | null {
  if (run.length === 0) {
    return null;
  }

  // Single vertex is not enough for a window (need two points for a segment)
  // But we still create a window - it might be a degenerate case
  const firstVertex = vertices[run[0]!]!;
  const lastVertex = vertices[run[run.length - 1]!]!;

  const start = firstVertex.computeXY();
  const end = lastVertex.computeXY();

  return {
    start,
    end,
    surface,
  };
}

// =============================================================================
// Utility Exports
// =============================================================================

/**
 * Check if a reflection window is valid (non-degenerate).
 * A valid window has distinct start and end points.
 */
export function isValidWindow(window: ReflectionWindow): boolean {
  return window.start.x !== window.end.x || window.start.y !== window.end.y;
}

/**
 * Get the full surface as a single window.
 * Useful when no obstructions exist.
 */
export function fullSurfaceWindow(surface: Surface): ReflectionWindow {
  return {
    start: surface.segment.start,
    end: surface.segment.end,
    surface,
  };
}
