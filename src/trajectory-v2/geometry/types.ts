/**
 * Geometry Layer Types
 *
 * Pure geometric types with no game dependencies.
 * These are the foundational primitives for all trajectory calculations.
 */

import type { Vector2 } from "@/types";

// Re-export Vector2 for convenience
export type { Vector2 };

/**
 * A ray defined by two points (NOT by origin + direction).
 *
 * This is the PREFERRED definition to avoid floating-point normalization errors.
 * Direction is implicit: from `from` toward `to` and beyond.
 *
 * First Principle: Direction is always derived from endpoints, never stored.
 */
export interface Ray {
  readonly from: Vector2;
  readonly to: Vector2;
}

/**
 * Result of a line-line intersection calculation.
 *
 * Uses parametric representation:
 * - t: Position along the first line (0 = start, 1 = end)
 * - s: Position along the second line (0 = start, 1 = end)
 *
 * For segment containment:
 * - t ∈ [0, 1] means intersection is on the first segment
 * - s ∈ [0, 1] means intersection is on the second segment
 *
 * For ray direction:
 * - t > 0 means intersection is in the forward direction of the ray
 * - t < 0 means intersection is behind the ray origin
 */
export interface IntersectionResult {
  /** The intersection point (only valid if `valid` is true) */
  readonly point: Vector2;
  /** Parametric position along the first line/ray */
  readonly t: number;
  /** Parametric position along the second line/segment */
  readonly s: number;
  /** Whether an intersection exists (false for parallel lines) */
  readonly valid: boolean;
}

/**
 * Result of a ray-segment intersection with additional hit info.
 */
export interface RaySegmentHitResult {
  /** Whether the ray hit the segment (t > 0 and s ∈ [0, 1]) */
  readonly hit: boolean;
  /** The intersection point (only valid if `hit` is true) */
  readonly point: Vector2;
  /** Parametric position along the ray (distance from origin in units of ray length) */
  readonly t: number;
  /** Parametric position along the segment (0 = start, 1 = end) */
  readonly s: number;
  /** Whether the hit is on the actual segment (s ∈ [0, 1]) vs extended line */
  readonly onSegment: boolean;
}

/**
 * Side of a line a point is on.
 * Using cross product sign convention:
 * - Positive: Left side of the line (when looking from start to end)
 * - Zero: On the line
 * - Negative: Right side of the line
 */
export type LineSide = number;

