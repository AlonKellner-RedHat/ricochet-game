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
