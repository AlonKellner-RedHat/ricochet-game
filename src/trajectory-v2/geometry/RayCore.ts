/**
 * RayCore - Core Ray Operations
 *
 * Unified ray-based geometry system for trajectory and visibility calculations.
 * All operations use exact arithmetic - no angles, no normalization.
 *
 * First Principles:
 * 1. Ray = two points (source, target) - direction is implicit
 * 2. All calculations use +, -, *, / only - no sqrt in core operations
 * 3. Parametric representation for exact positions
 * 4. Cross-product for side/containment checks
 */

import type { Vector2 } from "./types";

// =============================================================================
// Core Types
// =============================================================================

/**
 * A ray defined by two points (NOT by origin + normalized direction).
 * This preserves exactness - direction is implicit, no sqrt needed.
 *
 * The ray starts at `source` and extends infinitely through `target`.
 */
export interface Ray {
  readonly source: Vector2; // Ray origin
  readonly target: Vector2; // A point the ray passes through (NOT the endpoint)
}

/**
 * A line segment defined by two endpoints.
 */
export interface Segment {
  readonly start: Vector2;
  readonly end: Vector2;
}

/**
 * Result of ray-segment intersection.
 * Uses parametric form: point = source + t * (target - source)
 */
export interface RayHit {
  readonly point: Vector2;
  readonly t: number; // Position along ray (0=source, 1=target, >1=beyond)
  readonly s: number; // Position along segment (0=start, 1=end)
  readonly onSegment: boolean; // s ∈ [0, 1]
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a ray from source to target.
 */
export function createRay(source: Vector2, target: Vector2): Ray {
  return { source, target };
}

// =============================================================================
// Core Operations
// =============================================================================

/**
 * Calculate intersection of a ray with a line segment.
 *
 * Uses parametric form:
 * - Ray: P = source + t * (target - source), t >= 0
 * - Segment: Q = start + s * (end - start), s ∈ [0, 1]
 *
 * Returns null if:
 * - Ray and segment are parallel
 * - Intersection is behind the ray origin (t < 0)
 *
 * @param ray The ray to intersect
 * @param segment The segment to check
 * @returns RayHit with intersection details, or null if no forward intersection
 */
export function intersectRaySegment(ray: Ray, segment: Segment): RayHit | null {
  const { source: p1, target: p2 } = ray;
  const { start: p3, end: p4 } = segment;

  // Direction vectors
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  // Denominator of parametric equations
  const denominator = d1x * d2y - d1y * d2x;

  // Lines are parallel
  if (Math.abs(denominator) < 1e-12) {
    return null;
  }

  // Calculate parametric positions
  const dx = p1.x - p3.x;
  const dy = p1.y - p3.y;

  const t = (dx * d2y - dy * d2x) / -denominator;
  const s = (d1x * dy - d1y * dx) / denominator;

  // Intersection is behind ray origin
  if (t < 0) {
    return null;
  }

  // Calculate intersection point: source + t * (target - source)
  const point: Vector2 = {
    x: p1.x + t * d1x,
    y: p1.y + t * d1y,
  };

  // Check if intersection is on the segment
  const onSegment = s >= -1e-9 && s <= 1 + 1e-9;

  return { point, t, s, onSegment };
}

/**
 * Reflect a ray off a surface (line segment).
 *
 * The reflected ray:
 * - Starts at the intersection point
 * - Has direction reflected about the surface normal
 *
 * Uses exact arithmetic (no normalization until target point calculation).
 *
 * Formula:
 * reflected_direction = direction - 2 * (direction · normal) * normal
 *
 * @param ray The incoming ray
 * @param surface The surface to reflect off
 * @returns The reflected ray, or original ray if no intersection
 */
export function reflectRay(ray: Ray, surface: Segment): Ray {
  const hit = intersectRaySegment(ray, surface);

  if (!hit) {
    // No intersection - return original ray
    return ray;
  }

  // Direction vector of incoming ray (not normalized)
  const dx = ray.target.x - ray.source.x;
  const dy = ray.target.y - ray.source.y;

  // Surface direction
  const sx = surface.end.x - surface.start.x;
  const sy = surface.end.y - surface.start.y;

  // Normal vector (perpendicular to surface) - not normalized
  // Using right-hand rule: rotate surface direction 90 degrees
  const nx = -sy;
  const ny = sx;

  // Calculate reflection using formula: r = d - 2(d·n/n·n)n
  // This avoids normalization by computing the ratio
  const dotDN = dx * nx + dy * ny;
  const dotNN = nx * nx + ny * ny;

  const factor = (2 * dotDN) / dotNN;

  const rdx = dx - factor * nx;
  const rdy = dy - factor * ny;

  // Create target point at same distance as original ray length
  const rayLength = Math.sqrt(dx * dx + dy * dy);
  const reflectedLength = Math.sqrt(rdx * rdx + rdy * rdy);
  const scale = rayLength / reflectedLength;

  const target: Vector2 = {
    x: hit.point.x + rdx * scale,
    y: hit.point.y + rdy * scale,
  };

  return { source: hit.point, target };
}

/**
 * Check if a point lies on a ray (in the forward direction).
 *
 * Uses cross-product to check collinearity, then dot-product for direction.
 *
 * @param ray The ray to check
 * @param point The point to test
 * @param tolerance Maximum perpendicular distance to consider "on ray"
 * @returns True if point is on the ray (forward from source)
 */
export function isPointOnRay(
  ray: Ray,
  point: Vector2,
  tolerance: number = 1e-9
): boolean {
  const result = rayContainsPoint(ray, point, tolerance);
  return result !== null;
}

/**
 * Get the parametric position of a point on a ray.
 *
 * Returns { t } where point = source + t * (target - source)
 * Returns null if point is not on the ray (behind source or off-line).
 *
 * @param ray The ray
 * @param point The point to find
 * @param tolerance Maximum perpendicular distance to consider "on ray"
 * @returns { t } if point is on ray, null otherwise
 */
export function rayContainsPoint(
  ray: Ray,
  point: Vector2,
  tolerance: number = 1e-9
): { t: number } | null {
  const { source, target } = ray;

  // Direction vector
  const dx = target.x - source.x;
  const dy = target.y - source.y;

  // Vector from source to point
  const px = point.x - source.x;
  const py = point.y - source.y;

  // Length squared of direction
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-20) {
    // Degenerate ray - check if point is at source
    const distSq = px * px + py * py;
    return distSq < tolerance * tolerance ? { t: 0 } : null;
  }

  // Cross product for collinearity check
  const cross = dx * py - dy * px;
  const perpDistance = Math.abs(cross) / Math.sqrt(lenSq);

  if (perpDistance > tolerance) {
    return null; // Point is off the ray line
  }

  // Dot product for parametric position
  const t = (dx * px + dy * py) / lenSq;

  // Point must be in forward direction (t >= 0)
  if (t < -tolerance / Math.sqrt(lenSq)) {
    return null;
  }

  return { t };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the direction vector of a ray (not normalized).
 */
export function getRayDirection(ray: Ray): Vector2 {
  return {
    x: ray.target.x - ray.source.x,
    y: ray.target.y - ray.source.y,
  };
}

/**
 * Create a ray from a point in a given direction.
 * Direction does not need to be normalized.
 */
export function rayFromDirection(
  source: Vector2,
  direction: Vector2,
  length: number = 1000
): Ray {
  const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
  if (len < 1e-12) {
    return { source, target: source };
  }
  return {
    source,
    target: {
      x: source.x + (direction.x / len) * length,
      y: source.y + (direction.y / len) * length,
    },
  };
}

/**
 * Get a point along a ray at parametric position t.
 * t=0 is source, t=1 is target.
 */
export function pointOnRay(ray: Ray, t: number): Vector2 {
  return {
    x: ray.source.x + t * (ray.target.x - ray.source.x),
    y: ray.source.y + t * (ray.target.y - ray.source.y),
  };
}

