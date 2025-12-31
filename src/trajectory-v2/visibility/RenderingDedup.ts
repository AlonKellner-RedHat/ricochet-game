/**
 * RenderingDedup - Tolerance-based Visual Deduplication
 *
 * This is the ONLY place in the codebase where tolerance/epsilon comparisons
 * should be used. It's specifically for rendering purposes where sub-pixel
 * differences don't matter visually.
 *
 * Design Philosophy:
 * - Core logic uses exact SourcePoint comparisons (no epsilons)
 * - Rendering layer uses visual tolerance for performance and visual quality
 * - This separation keeps the math exact while allowing practical rendering
 */

import { type SourcePoint, isHitPoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

/**
 * Default visual tolerance in pixels.
 * Points closer than this are considered visually identical.
 *
 * @deprecated No longer used - deduplication is now exact (provenance-based).
 * Tolerance-based deduplication caused bugs where geometrically distinct
 * vertices from different sources were incorrectly merged.
 */
export const VISUAL_TOLERANCE_PIXELS = 0.5;

/**
 * Remove duplicate points from a polygon for rendering.
 *
 * IMPORTANT: Uses EXACT equality only - no tolerance/epsilon.
 *
 * The core visibility algorithm (projectConeV2) already performs provenance-based
 * deduplication using SourcePoint.equals(). This function only removes points
 * that are EXACTLY identical (same x and y coordinates).
 *
 * Tolerance-based deduplication was removed because it caused bugs where
 * geometrically distinct vertices from different sources (e.g., a window
 * endpoint at (1000, 420) and a computed hit at (1000.46, 420)) were
 * incorrectly merged, breaking the visibility polygon.
 *
 * @param vertices - Polygon vertices (already sorted and processed)
 * @param _tolerance - DEPRECATED: Ignored. Kept for API compatibility.
 */
export function dedupeForRendering(vertices: Vector2[], _tolerance?: number): Vector2[] {
  if (vertices.length <= 2) return vertices;

  const result: Vector2[] = [];

  for (const v of vertices) {
    // Only remove EXACT duplicates (same coordinates)
    // This is epsilon-free and provenance-safe
    if (result.length === 0) {
      result.push(v);
      continue;
    }

    const prev = result[result.length - 1]!;

    // EXACT equality check - no tolerance
    // Different sources can produce very close but distinct vertices
    // that must be preserved for correct polygon shape
    if (v.x !== prev.x || v.y !== prev.y) {
      result.push(v);
    }
  }

  // Also check wrap-around: if first and last are EXACTLY the same, remove last
  if (result.length > 2) {
    const first = result[0]!;
    const last = result[result.length - 1]!;

    if (first.x === last.x && first.y === last.y) {
      result.pop();
    }
  }

  return result;
}

/**
 * Remove consecutive HitPoints on the same surface, keeping only extremes.
 *
 * PROVENANCE-BASED DEDUPLICATION:
 * - For each run of consecutive HitPoints on the same surface, keep only the
 *   first and last (the "extremes" of the run)
 * - Endpoints, JunctionPoints, and OriginPoints are ALWAYS kept
 *
 * This approach uses the source-of-truth (surface ID) rather than geometric
 * calculations, avoiding floating-point precision issues.
 *
 * Example:
 *   Input:  [Hit(A), Hit(A), Hit(A), Endpoint(A), Hit(B), Hit(B)]
 *   Output: [Hit(A), Hit(A), Endpoint(A), Hit(B), Hit(B)]
 *           (middle Hit(A) removed, but first/last of each run kept)
 *
 * @param points - SourcePoints from visibility polygon
 * @returns Deduplicated SourcePoints with only extreme HitPoints per surface run
 */
export function dedupeConsecutiveHits(points: SourcePoint[]): SourcePoint[] {
  if (points.length <= 2) return points;

  const result: SourcePoint[] = [];

  // Track runs of consecutive HitPoints on the same surface
  let runStart: number | null = null;
  let runSurfaceId: string | null = null;

  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;

    if (isHitPoint(point)) {
      const surfaceId = point.hitSurface.id;

      if (runStart === null) {
        // Start a new run
        runStart = i;
        runSurfaceId = surfaceId;
      } else if (surfaceId !== runSurfaceId) {
        // End current run and start a new one
        // Add the last point of the previous run if it's different from the first
        if (runStart < i - 1) {
          result.push(points[i - 1]!);
        }
        // Start new run
        runStart = i;
        runSurfaceId = surfaceId;
      }
      // If same surface, we're continuing the run - don't add yet

      // Always add the first point of a run
      if (runStart === i) {
        result.push(point);
      }
    } else {
      // Non-HitPoint (Endpoint, JunctionPoint, OriginPoint) - always keep
      // But first, close any open run
      if (runStart !== null && runStart < i - 1) {
        // Add the last HitPoint of the run (if not already added as first)
        result.push(points[i - 1]!);
      }
      runStart = null;
      runSurfaceId = null;

      result.push(point);
    }
  }

  // Close any final open run
  if (runStart !== null && runStart < points.length - 1) {
    result.push(points[points.length - 1]!);
  }

  return result;
}

/**
 * Remove visually duplicate SourcePoints for rendering.
 *
 * @param points - SourcePoints to deduplicate
 * @param tolerance - Visual tolerance in pixels
 */
export function dedupeSourcePointsForRendering(
  points: SourcePoint[],
  tolerance = VISUAL_TOLERANCE_PIXELS
): SourcePoint[] {
  if (points.length <= 2) return points;

  const result: SourcePoint[] = [];

  for (const p of points) {
    const pXY = p.computeXY();
    let isTooClose = false;

    for (const existing of result) {
      const existingXY = existing.computeXY();
      const dx = pXY.x - existingXY.x;
      const dy = pXY.y - existingXY.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < tolerance * tolerance) {
        isTooClose = true;
        break;
      }
    }

    if (!isTooClose) {
      result.push(p);
    }
  }

  return result;
}

/**
 * Prepare polygon for rendering.
 *
 * Applies provenance-based deduplication:
 * 1. Remove consecutive HitPoints on the same surface (keep extremes)
 * 2. Remove exact coordinate duplicates
 *
 * This approach uses source-of-truth (surface ID) rather than geometric
 * epsilon-based calculations, avoiding floating-point precision bugs.
 *
 * @param points - SourcePoints from visibility polygon
 * @returns Vector2[] ready for rendering
 */
export function preparePolygonForRendering(points: SourcePoint[]): Vector2[] {
  const deduped = dedupeConsecutiveHits(points);
  const vectors = deduped.map((p) => p.computeXY());
  return dedupeForRendering(vectors);
}
