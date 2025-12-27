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
 */
export const VISUAL_TOLERANCE_PIXELS = 0.5;

/**
 * Remove visually duplicate points from a polygon for rendering.
 *
 * This should be called AFTER all exact calculations are complete,
 * right before passing vertices to the graphics renderer.
 *
 * @param vertices - Polygon vertices (already sorted and processed)
 * @param tolerance - Minimum distance between vertices (default: 0.5 pixels)
 */
export function dedupeForRendering(vertices: Vector2[], tolerance = VISUAL_TOLERANCE_PIXELS): Vector2[] {
  if (vertices.length <= 2) return vertices;

  const result: Vector2[] = [];

  for (const v of vertices) {
    // Only check against the PREVIOUS vertex (sequential deduplication)
    // Non-adjacent vertices can be close together without being duplicates
    // (e.g., two shadow extensions that hit near the same point)
    if (result.length === 0) {
      result.push(v);
      continue;
    }

    const prev = result[result.length - 1]!;
    const dx = v.x - prev.x;
    const dy = v.y - prev.y;
    const distSq = dx * dx + dy * dy;

    if (distSq >= tolerance * tolerance) {
      result.push(v);
    }
  }

  // Also check wrap-around: if first and last are too close, remove last
  if (result.length > 2) {
    const first = result[0]!;
    const last = result[result.length - 1]!;
    const dx = first.x - last.x;
    const dy = first.y - last.y;
    const distSq = dx * dx + dy * dy;

    if (distSq < tolerance * tolerance) {
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

