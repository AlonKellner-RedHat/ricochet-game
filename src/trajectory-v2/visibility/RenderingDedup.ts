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

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";

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
 * Remove collinear points that don't affect the visual polygon shape.
 *
 * When three consecutive points are collinear (within tolerance),
 * the middle point can be removed without changing the visual appearance.
 *
 * @param vertices - Polygon vertices
 * @param tolerance - Collinearity tolerance (default: 1 pixel area)
 */
export function removeCollinearPoints(vertices: Vector2[], tolerance = 1): Vector2[] {
  if (vertices.length <= 3) return vertices;

  const result: Vector2[] = [];

  for (let i = 0; i < vertices.length; i++) {
    const prev = vertices[(i - 1 + vertices.length) % vertices.length]!;
    const curr = vertices[i]!;
    const next = vertices[(i + 1) % vertices.length]!;

    // Cross product gives twice the signed area of the triangle
    const cross =
      (curr.x - prev.x) * (next.y - prev.y) - (curr.y - prev.y) * (next.x - prev.x);

    // Check if collinear (small cross product)
    if (Math.abs(cross) <= tolerance * 2) {
      // Additional check: only remove if curr is BETWEEN prev and next on the line segment
      // This prevents removing vertices that form a "backtrack" in the polygon
      // (e.g., going 80 → 500 → 350 on the same vertical line is NOT the same as 80 → 350)
      const prevToNext = Math.hypot(next.x - prev.x, next.y - prev.y);
      const prevToCurr = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const currToNext = Math.hypot(next.x - curr.x, next.y - curr.y);

      // curr is between prev and next if the sum of distances equals the direct distance
      // (within tolerance for floating point)
      const isBetween = Math.abs(prevToCurr + currToNext - prevToNext) < 1;

      if (isBetween) {
        // Additional safety check: don't remove points that would create
        // a significant directional change. Even if points are collinear,
        // removing a "corner" point can create visual issues.
        // Check if the direction from prev→curr is the same as curr→next
        const dirPrevCurr = { x: curr.x - prev.x, y: curr.y - prev.y };
        const dirCurrNext = { x: next.x - curr.x, y: next.y - curr.y };
        
        // Dot product > 0 means same direction
        const dot = dirPrevCurr.x * dirCurrNext.x + dirPrevCurr.y * dirCurrNext.y;
        
        if (dot > 0) {
          // Same direction, safe to remove
          continue;
        }
        // Different direction (backtrack), keep this point
      }
    }

    // Keep this point (either not collinear, or collinear but not between, or backtrack)
    result.push(curr);
  }

  return result;
}

/**
 * Prepare polygon for rendering.
 *
 * Applies all visual optimizations:
 * 1. Remove visually duplicate points
 * 2. Remove collinear points
 *
 * @param vertices - Raw polygon vertices
 * @param duplicateTolerance - Distance tolerance for duplicates
 * @param collinearTolerance - Area tolerance for collinearity
 */
export function preparePolygonForRendering(
  vertices: Vector2[],
  duplicateTolerance = VISUAL_TOLERANCE_PIXELS,
  collinearTolerance = 1
): Vector2[] {
  let result = dedupeForRendering(vertices, duplicateTolerance);
  result = removeCollinearPoints(result, collinearTolerance);
  return result;
}

