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
 */

import type { Vector2, RangeSemiCircle } from "./types";

/**
 * Angular bounds for each semi-circle (radians, 0 = right, CCW positive).
 * Each covers 180° (π radians).
 * 
 * Defined here instead of imported to avoid potential circular import issues.
 */
const SEMICIRCLE_ANGLES: Record<RangeSemiCircle, { start: number; end: number }> = {
  "top":    { start: 0,              end: Math.PI },       // 0° to 180°
  "bottom": { start: -Math.PI,       end: 0 },             // -180° to 0°
  "right":  { start: -Math.PI / 2,   end: Math.PI / 2 },   // -90° to 90°
  "left":   { start: Math.PI / 2,    end: -Math.PI / 2 },  // 90° to -90° (wraps)
};

/**
 * Get the angle of a direction vector (radians, -PI to PI).
 * Uses standard atan2 convention: 0 = right (+x), positive = CCW.
 *
 * Note: In screen coordinates where +y is down, this means:
 * - 0 = right
 * - PI/2 = down
 * - PI or -PI = left
 * - -PI/2 = up
 */
export function directionToAngle(direction: Vector2): number {
  return Math.atan2(direction.y, direction.x);
}

/**
 * Check if an angle falls within a semi-circle's bounds.
 *
 * @param angle - The angle to check (radians, -PI to PI)
 * @param half - Which semi-circle to check against
 * @returns true if the angle is within the semi-circle's angular span
 */
export function isAngleInSemiCircle(angle: number, half: RangeSemiCircle): boolean {
  const bounds = SEMICIRCLE_ANGLES[half];

  // Handle the "left" semi-circle which wraps around ±PI
  if (half === "left") {
    // Left covers PI/2 to PI and -PI to -PI/2
    // Equivalently: angle >= PI/2 OR angle <= -PI/2
    return angle >= bounds.start || angle <= bounds.end;
  }

  // For non-wrapping semi-circles, just check if angle is in [start, end]
  return angle >= bounds.start && angle <= bounds.end;
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
