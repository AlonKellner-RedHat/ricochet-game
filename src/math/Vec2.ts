import type { Vector2 } from "@/types";

/**
 * Vec2 - Pure utility functions for 2D vector operations
 * All functions are immutable and return new vectors
 */
export const Vec2 = {
  /**
   * Create a new vector
   */
  create(x: number, y: number): Vector2 {
    return { x, y };
  },

  /**
   * Return a zero vector
   */
  zero(): Vector2 {
    return { x: 0, y: 0 };
  },

  /**
   * Add two vectors
   */
  add(a: Vector2, b: Vector2): Vector2 {
    return { x: a.x + b.x, y: a.y + b.y };
  },

  /**
   * Subtract vector b from vector a
   */
  subtract(a: Vector2, b: Vector2): Vector2 {
    return { x: a.x - b.x, y: a.y - b.y };
  },

  /**
   * Scale a vector by a scalar
   */
  scale(v: Vector2, scalar: number): Vector2 {
    return { x: v.x * scalar, y: v.y * scalar };
  },

  /**
   * Calculate dot product of two vectors
   */
  dot(a: Vector2, b: Vector2): number {
    return a.x * b.x + a.y * b.y;
  },

  /**
   * Calculate squared length of a vector (faster than length, useful for comparisons)
   */
  lengthSquared(v: Vector2): number {
    return v.x * v.x + v.y * v.y;
  },

  /**
   * Calculate length (magnitude) of a vector
   */
  length(v: Vector2): number {
    return Math.sqrt(Vec2.lengthSquared(v));
  },

  /**
   * Normalize a vector to unit length
   * Returns zero vector if input is zero vector
   */
  normalize(v: Vector2): Vector2 {
    const len = Vec2.length(v);
    if (len === 0) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
  },

  /**
   * Get perpendicular vector (90° counter-clockwise rotation)
   */
  perpendicular(v: Vector2): Vector2 {
    return { x: -v.y, y: v.x };
  },

  /**
   * Calculate distance between two points
   */
  distance(a: Vector2, b: Vector2): number {
    return Vec2.length(Vec2.subtract(b, a));
  },

  /**
   * Get normalized direction vector from point a to point b
   */
  direction(from: Vector2, to: Vector2): Vector2 {
    return Vec2.normalize(Vec2.subtract(to, from));
  },

  /**
   * Reflect a direction vector off a surface with given normal
   * Uses formula: r = d - 2(d · n)n
   * @param direction - The incident direction (will be normalized)
   * @param normal - The surface normal (will be normalized)
   * @returns The reflected direction (normalized)
   */
  reflect(direction: Vector2, normal: Vector2): Vector2 {
    const d = Vec2.normalize(direction);
    const n = Vec2.normalize(normal);
    const dotProduct = Vec2.dot(d, n);
    return Vec2.subtract(d, Vec2.scale(n, 2 * dotProduct));
  },

  /**
   * Calculate the shortest distance from a point to a line segment
   * @param point - The point to measure from
   * @param segmentStart - Start of the line segment
   * @param segmentEnd - End of the line segment
   * @returns The shortest distance from point to segment
   */
  pointToSegmentDistance(point: Vector2, segmentStart: Vector2, segmentEnd: Vector2): number {
    const v = Vec2.subtract(segmentEnd, segmentStart);
    const w = Vec2.subtract(point, segmentStart);

    const c1 = Vec2.dot(w, v);
    if (c1 <= 0) {
      // Point is before segment start
      return Vec2.distance(point, segmentStart);
    }

    const c2 = Vec2.dot(v, v);
    if (c2 <= c1) {
      // Point is after segment end
      return Vec2.distance(point, segmentEnd);
    }

    // Point projects onto segment
    const t = c1 / c2;
    const projection = Vec2.add(segmentStart, Vec2.scale(v, t));
    return Vec2.distance(point, projection);
  },

  /**
   * Reflect a point through an infinite line defined by two points
   *
   * First principles derivation:
   * 1. Find direction of line: d = normalize(lineEnd - lineStart)
   * 2. Find vector from line to point: v = point - lineStart
   * 3. Project v onto line direction: proj_scalar = dot(v, d)
   * 4. Find projection point on line: P_proj = lineStart + proj_scalar * d
   * 5. Reflection is: P' = 2 * P_proj - point
   *
   * @param point - The point to reflect
   * @param lineStart - First point defining the line
   * @param lineEnd - Second point defining the line
   * @returns The reflected point
   */
  reflectPointThroughLine(point: Vector2, lineStart: Vector2, lineEnd: Vector2): Vector2 {
    // Line direction (not normalized, we'll use squared length)
    const lineDir = Vec2.subtract(lineEnd, lineStart);
    const lineLengthSq = Vec2.lengthSquared(lineDir);

    // Handle degenerate line (both points same)
    if (lineLengthSq === 0) {
      return { ...point };
    }

    // Vector from line start to point
    const toPoint = Vec2.subtract(point, lineStart);

    // Scalar projection onto line (as fraction of line length)
    const t = Vec2.dot(toPoint, lineDir) / lineLengthSq;

    // Projection point on the line
    const projection = Vec2.add(lineStart, Vec2.scale(lineDir, t));

    // Reflection: P' = 2 * projection - point
    return Vec2.subtract(Vec2.scale(projection, 2), point);
  },
};
