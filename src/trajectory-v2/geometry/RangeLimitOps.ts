/**
 * RangeLimitOps - Geometry operations for range limit semi-circles.
 *
 * These functions support the range limit obstacle system, which blocks
 * trajectories at a maximum distance from the player image.
 *
 * Key concepts:
 * - Semi-circles with quadrant-aligned boundaries (top/bottom or left/right)
 * - Direction-based filtering (only rays pointing INTO a semi-circle are affected)
 * - Inside/outside logic determines hit point location
 *
 * IMPORTANT: Uses coordinate sign checks (not atan2) for project rule compliance.
 * This ensures exact, floating-point-stable comparisons.
 */

import type { Vector2, RangeSemiCircle } from "./types";

/**
 * Check if a direction vector points into a semi-circle.
 *
 * Uses exact coordinate sign checks (no atan2, no epsilon comparisons).
 *
 * Semi-circle definitions (in screen coordinates where +y is down):
 * - "top":    y <= 0 (pointing upward)
 * - "bottom": y >= 0 (pointing downward)
 * - "left":   x <= 0 (pointing left)
 * - "right":  x >= 0 (pointing right)
 *
 * @param direction - The direction vector to check (does not need to be normalized)
 * @param half - Which semi-circle to check against
 * @returns true if the direction points into the specified semi-circle
 */
export function isDirectionInSemiCircle(
  direction: Vector2,
  half: RangeSemiCircle
): boolean {
  switch (half) {
    case "top":
      return direction.y <= 0; // Pointing upward (screen coords)
    case "bottom":
      return direction.y >= 0; // Pointing downward
    case "left":
      return direction.x <= 0; // Pointing left
    case "right":
      return direction.x >= 0; // Pointing right
  }
}

/**
 * Check if a point is inside (or on) a circle.
 *
 * @param point - The point to check
 * @param center - Center of the circle
 * @param radius - Radius of the circle
 * @returns true if distance from point to center is <= radius
 */
export function isInsideCircle(
  point: Vector2,
  center: Vector2,
  radius: number
): boolean {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distSq = dx * dx + dy * dy;
  return distSq <= radius * radius;
}

/**
 * Compute the hit point for a range limit.
 *
 * Logic:
 * - If start is inside circle: hit at distance R from origin in ray direction
 * - If start is outside circle: hit at start position (immediately blocked)
 *
 * @param originImage - Current player image (center of range circle)
 * @param radius - Radius of the range limit
 * @param rayDirection - Direction of the ray (not necessarily normalized)
 * @param startPosition - Where the ray segment starts (from startLine)
 * @returns Hit point and whether start was inside the circle
 */
export function computeRangeLimitHitPoint(
  originImage: Vector2,
  radius: number,
  rayDirection: Vector2,
  startPosition: Vector2
): { point: Vector2; wasInsideCircle: boolean } {
  const wasInsideCircle = isInsideCircle(startPosition, originImage, radius);

  if (!wasInsideCircle) {
    // Start is outside circle - immediately blocked at start
    return {
      point: { x: startPosition.x, y: startPosition.y },
      wasInsideCircle: false,
    };
  }

  // Start is inside circle - hit at distance R from origin in ray direction
  // Normalize the direction
  const len = Math.sqrt(rayDirection.x * rayDirection.x + rayDirection.y * rayDirection.y);
  if (len === 0) {
    // Degenerate case: no direction, return start position
    return {
      point: { x: startPosition.x, y: startPosition.y },
      wasInsideCircle: true,
    };
  }

  const nx = rayDirection.x / len;
  const ny = rayDirection.y / len;

  return {
    point: {
      x: originImage.x + radius * nx,
      y: originImage.y + radius * ny,
    },
    wasInsideCircle: true,
  };
}

/**
 * Result of a line-circle intersection.
 */
export interface LineCircleIntersection {
  /** Parameter along segment (0 = start, 1 = end) */
  readonly t: number;
  /** The intersection point */
  readonly point: Vector2;
}

/**
 * Find where a line segment intersects a circle.
 *
 * Uses exact quadratic formula: |P + t*D - C|^2 = R^2
 * where P = segStart, D = segEnd - segStart, C = center, R = radius
 *
 * Expands to: a*t^2 + b*t + c = 0
 * where:
 *   a = D·D (length squared of segment)
 *   b = 2 * D·(P - C)
 *   c = |P - C|^2 - R^2
 *
 * Returns only intersections where t is in [0, 1] (on the segment).
 * Results are sorted by ascending t value.
 *
 * @param segStart - Start of the line segment
 * @param segEnd - End of the line segment
 * @param center - Center of the circle
 * @param radius - Radius of the circle
 * @returns Array of 0, 1, or 2 intersection points with their t values
 */
export function computeLineCircleIntersections(
  segStart: Vector2,
  segEnd: Vector2,
  center: Vector2,
  radius: number
): LineCircleIntersection[] {
  // Direction vector: D = segEnd - segStart
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;

  // Vector from center to start: P - C
  const fx = segStart.x - center.x;
  const fy = segStart.y - center.y;

  // Quadratic coefficients
  const a = dx * dx + dy * dy; // D·D
  const b = 2 * (fx * dx + fy * dy); // 2 * (P - C)·D
  const c = fx * fx + fy * fy - radius * radius; // |P - C|^2 - R^2

  // Handle degenerate case: zero-length segment
  if (a === 0) {
    // Check if the single point is on the circle
    if (c === 0) {
      // Point is exactly on circle
      return [{ t: 0, point: { x: segStart.x, y: segStart.y } }];
    }
    return [];
  }

  // Discriminant: b^2 - 4ac
  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) {
    // No real solutions - line misses circle entirely
    return [];
  }

  const results: LineCircleIntersection[] = [];

  if (discriminant === 0) {
    // One solution (tangent)
    const t = -b / (2 * a);
    if (t >= 0 && t <= 1) {
      results.push({
        t,
        point: {
          x: segStart.x + t * dx,
          y: segStart.y + t * dy,
        },
      });
    }
  } else {
    // Two solutions
    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    // Add solutions that are on the segment (t in [0, 1])
    // They are already in ascending order since t1 < t2 (sqrtDisc > 0)
    if (t1 >= 0 && t1 <= 1) {
      results.push({
        t: t1,
        point: {
          x: segStart.x + t1 * dx,
          y: segStart.y + t1 * dy,
        },
      });
    }
    if (t2 >= 0 && t2 <= 1) {
      results.push({
        t: t2,
        point: {
          x: segStart.x + t2 * dx,
          y: segStart.y + t2 * dy,
        },
      });
    }
  }

  return results;
}
