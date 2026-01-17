/**
 * GeometryOps - Pure geometry functions
 *
 * All functions are stateless and have no side effects.
 * No game types (Surface, Arrow, etc.) are used here.
 * These functions are directly translatable to GLSL.
 *
 * First Principles:
 * - No normalization (no square roots for direction vectors)
 * - Point-based rays (direction derived from endpoints)
 * - All calculations use only +, -, *, / operations
 */

import type {
  IntersectionResult,
  LineSide,
  Ray,
  RaySegmentHitResult,
  Vector2,
} from "./types";

/**
 * Calculate the intersection of two infinite lines.
 *
 * Line 1 passes through p1 and p2.
 * Line 2 passes through p3 and p4.
 *
 * Returns parametric positions:
 * - t: position along line 1 (0 = p1, 1 = p2)
 * - s: position along line 2 (0 = p3, 1 = p4)
 *
 * Formula (no square roots):
 * t = ((p1.x - p3.x)(p3.y - p4.y) - (p1.y - p3.y)(p3.x - p4.x)) /
 *     ((p1.x - p2.x)(p3.y - p4.y) - (p1.y - p2.y)(p3.x - p4.x))
 *
 * @param p1 First point of line 1
 * @param p2 Second point of line 1
 * @param p3 First point of line 2
 * @param p4 Second point of line 2
 * @returns Intersection result with parametric positions
 */
export function lineLineIntersection(
  p1: Vector2,
  p2: Vector2,
  p3: Vector2,
  p4: Vector2
): IntersectionResult {
  const denominator =
    (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);

  // Lines are parallel (or coincident)
  if (denominator === 0) {
    return {
      point: { x: 0, y: 0 },
      t: Number.POSITIVE_INFINITY,
      s: Number.POSITIVE_INFINITY,
      valid: false,
    };
  }

  const t =
    ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) /
    denominator;

  const s =
    -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) /
    denominator;

  // Calculate intersection point: p1 + t * (p2 - p1)
  const point: Vector2 = {
    x: p1.x + t * (p2.x - p1.x),
    y: p1.y + t * (p2.y - p1.y),
  };

  return { point, t, s, valid: true };
}

/**
 * Reflect a point through an infinite line defined by two points.
 *
 * First Principles Derivation (no normalization):
 * 1. Line direction: d = lineP2 - lineP1
 * 2. Vector from line to point: v = point - lineP1
 * 3. Projection scalar: t = (v · d) / (d · d)
 * 4. Projection point on line: P_proj = lineP1 + t * d
 * 5. Reflection: P' = 2 * P_proj - point
 *
 * @param point The point to reflect
 * @param lineP1 First point defining the line
 * @param lineP2 Second point defining the line
 * @returns The reflected point
 */
export function reflectPointThroughLine(
  point: Vector2,
  lineP1: Vector2,
  lineP2: Vector2
): Vector2 {
  // Line direction (not normalized)
  const dx = lineP2.x - lineP1.x;
  const dy = lineP2.y - lineP1.y;

  // Squared length of line direction
  const lineLengthSq = dx * dx + dy * dy;

  // Handle degenerate line (both points same)
  if (lineLengthSq === 0) {
    return { x: point.x, y: point.y };
  }

  // Vector from line start to point
  const vx = point.x - lineP1.x;
  const vy = point.y - lineP1.y;

  // Scalar projection (as fraction of line length)
  const t = (vx * dx + vy * dy) / lineLengthSq;

  // Projection point on the line
  const projX = lineP1.x + t * dx;
  const projY = lineP1.y + t * dy;

  // Reflection: P' = 2 * projection - point
  return {
    x: 2 * projX - point.x,
    y: 2 * projY - point.y,
  };
}

/**
 * Determine which side of a line a point is on.
 *
 * Uses 2D cross product (perpendicular dot product):
 * sign = (lineP2.x - lineP1.x) * (point.y - lineP1.y) -
 *        (lineP2.y - lineP1.y) * (point.x - lineP1.x)
 *
 * @param point The point to test
 * @param lineP1 First point defining the line
 * @param lineP2 Second point defining the line
 * @returns Positive if left of line, negative if right, zero if on line
 */
export function pointSideOfLine(
  point: Vector2,
  lineP1: Vector2,
  lineP2: Vector2
): LineSide {
  return (
    (lineP2.x - lineP1.x) * (point.y - lineP1.y) -
    (lineP2.y - lineP1.y) * (point.x - lineP1.x)
  );
}

/**
 * Check if a parametric position is on a segment.
 * EXACT check - no tolerance.
 *
 * @param t Parametric position (0 = start, 1 = end)
 * @returns True if t is in [0, 1]
 */
export function isOnSegment(t: number): boolean {
  return t >= 0 && t <= 1;
}

/**
 * Calculate intersection of a ray with a line segment.
 *
 * The ray starts at `ray.source` and passes through `ray.target`.
 * The segment is from `segStart` to `segEnd`.
 *
 * @param ray The ray (defined by two points)
 * @param segStart Start of the segment
 * @param segEnd End of the segment
 * @returns Hit result with parametric positions
 */
export function raySegmentIntersect(
  ray: Ray,
  segStart: Vector2,
  segEnd: Vector2
): RaySegmentHitResult {
  const result = lineLineIntersection(ray.source, ray.target, segStart, segEnd);

  if (!result.valid) {
    return {
      hit: false,
      point: { x: 0, y: 0 },
      t: Number.POSITIVE_INFINITY,
      s: 0,
      onSegment: false,
    };
  }

  // Ray goes forward if t > 0
  // Segment is hit if s ∈ [0, 1]
  const isForward = result.t > 0;
  const onSegment = isOnSegment(result.s);
  const hit = isForward && onSegment;

  return {
    hit,
    point: result.point,
    t: result.t,
    s: result.s,
    onSegment,
  };
}

/**
 * Calculate the squared distance between two points.
 * (Avoids square root for performance)
 *
 * @param a First point
 * @param b Second point
 * @returns Squared distance
 */
export function distanceSquared(a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/**
 * Calculate the distance between two points.
 *
 * @param a First point
 * @param b Second point
 * @returns Distance
 */
export function distance(a: Vector2, b: Vector2): number {
  return Math.sqrt(distanceSquared(a, b));
}

/**
 * Add two vectors.
 *
 * @param a First vector
 * @param b Second vector
 * @returns Sum vector
 */
export function add(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

/**
 * Subtract vector b from vector a.
 *
 * @param a First vector
 * @param b Second vector
 * @returns Difference vector
 */
export function subtract(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

/**
 * Scale a vector by a scalar.
 *
 * @param v Vector
 * @param scalar Scalar value
 * @returns Scaled vector
 */
export function scale(v: Vector2, scalar: number): Vector2 {
  return { x: v.x * scalar, y: v.y * scalar };
}

/**
 * Calculate dot product of two vectors.
 *
 * @param a First vector
 * @param b Second vector
 * @returns Dot product
 */
export function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

