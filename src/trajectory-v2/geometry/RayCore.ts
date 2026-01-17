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

import type { Vector2, Ray } from "./types";

// Re-export Ray for backward compatibility with files that import from RayCore
export type { Ray };

// =============================================================================
// Core Types
// =============================================================================

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
 * Create a ray from source to target (startRatio defaults to 0).
 */
export function createRay(source: Vector2, target: Vector2): Ray {
  return { source, target };
}

/**
 * Create a ray with a specified startRatio.
 *
 * The ray conceptually starts at effectiveStart = source + startRatio * (target - source).
 * This is useful when the source is off-screen but the ray should start on a surface.
 *
 * @param source The logical source (e.g., reflected player image)
 * @param target A point defining the ray direction
 * @param startRatio Where the ray actually starts (0=source, 1=target)
 */
export function createRayWithStart(
  source: Vector2,
  target: Vector2,
  startRatio: number
): Ray {
  return { source, target, startRatio };
}

/**
 * Get the effective starting point of a ray.
 *
 * For a ray with startRatio, this computes:
 *   effectiveStart = source + startRatio * (target - source)
 *
 * This is exact: no sqrt, no normalization.
 *
 * @param ray The ray
 * @returns The effective starting point
 */
export function effectiveStart(ray: Ray): Vector2 {
  const ratio = ray.startRatio ?? 0;
  return {
    x: ray.source.x + ratio * (ray.target.x - ray.source.x),
    y: ray.source.y + ratio * (ray.target.y - ray.source.y),
  };
}

// =============================================================================
// Core Operations
// =============================================================================

/**
 * Calculate intersection of a ray with a line segment.
 *
 * Uses parametric form:
 * - Ray: P = source + t * (target - source), t >= startRatio
 * - Segment: Q = start + s * (end - start), s ∈ [0, 1]
 *
 * Returns null if:
 * - Ray and segment are parallel
 * - Intersection is before the ray's effective start (t < startRatio)
 *
 * When ray has startRatio set, hits before that position are ignored.
 * This is crucial for off-screen origins where the ray should start on a surface.
 *
 * @param ray The ray to intersect
 * @param segment The segment to check
 * @returns RayHit with intersection details, or null if no valid intersection
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
  if (denominator === 0) {
    return null;
  }

  // Calculate parametric positions
  const dx = p1.x - p3.x;
  const dy = p1.y - p3.y;

  const t = (dx * d2y - dy * d2x) / -denominator;
  const s = (d1x * dy - d1y * dx) / denominator;

  // Use startRatio as the minimum t value (default 0)
  const minT = ray.startRatio ?? 0;

  // Intersection is before the ray's effective start
  if (t < minT) {
    return null;
  }

  // Calculate intersection point: source + t * (target - source)
  const point: Vector2 = {
    x: p1.x + t * d1x,
    y: p1.y + t * d1y,
  };

  // Check if intersection is on the segment
  const onSegment = s >= 0 && s <= 1;

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
 * @param ray The incoming ray
 * @param surface The surface to reflect off
 * @returns The reflected ray starting from hit point
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
  const nx = -sy;
  const ny = sx;

  // Calculate reflection using formula: r = d - 2(d·n/n·n)n
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
 * Reflect a ray THROUGH a surface line (mirror reflection).
 *
 * This function reflects the SOURCE and TARGET points through the surface line,
 * preserving the startRatio. This is used for visibility calculations
 * where we want to track the "image" of the source through reflections.
 *
 * The reflected ray maintains the same parametric structure:
 * - source is reflected through the surface line
 * - target is reflected through the surface line
 * - startRatio is preserved (so effective start stays on the surface)
 *
 * @param ray The incoming ray
 * @param surface The surface to reflect through (as a mirror)
 * @returns The reflected ray with same startRatio
 */
export function reflectRayThroughLine(ray: Ray, surface: Segment): Ray {
  // Reflect source and target through the surface line
  const reflectedSource = reflectPointThroughSegment(ray.source, surface);
  const reflectedTarget = reflectPointThroughSegment(ray.target, surface);

  return {
    source: reflectedSource,
    target: reflectedTarget,
    startRatio: ray.startRatio, // Preserved!
  };
}

/**
 * Reflect a point through a line segment (as an infinite line).
 *
 * Formula: P' = P - 2 * ((P - A) · n) / (n · n) * n
 * where n is the normal to the line, A is a point on the line.
 */
export function reflectPointThroughSegment(point: Vector2, segment: Segment): Vector2 {
  const { start: a, end: b } = segment;

  // Direction of segment (line)
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  // Normal to the line (perpendicular)
  const nx = -dy;
  const ny = dx;

  // Vector from line point A to the point P
  const px = point.x - a.x;
  const py = point.y - a.y;

  // Project onto normal: (P - A) · n
  const dotPN = px * nx + py * ny;

  // Normal squared: n · n
  const dotNN = nx * nx + ny * ny;

  if (dotNN === 0) {
    return point; // Degenerate segment
  }

  // Reflection: P' = P - 2 * ((P - A) · n / n · n) * n
  const factor = (2 * dotPN) / dotNN;

  return {
    x: point.x - factor * nx,
    y: point.y - factor * ny,
  };
}

// =============================================================================
// SURFACE CONVENIENCE WRAPPERS
// =============================================================================

import type { Surface } from "@/surfaces/Surface";

/**
 * Reflect a point through a surface (using the surface's segment as the mirror line).
 *
 * @param point The point to reflect
 * @param surface The surface to reflect through
 * @returns The reflected point
 */
export function reflectPointThroughSurface(point: Vector2, surface: Surface): Vector2 {
  return reflectPointThroughSegment(point, surface.segment);
}

/**
 * Reflect a ray through a surface (reflecting both source and target).
 *
 * This is the core primitive for bidirectional image reflection:
 * - Reflects the ray's source through the surface
 * - Reflects the ray's target through the surface
 * - Returns a new ray with reflected endpoints
 *
 * @param ray The ray to reflect
 * @param surface The surface to reflect through
 * @returns A new ray with reflected source and target
 */
export function reflectRayThroughSurface(ray: Ray, surface: Surface): Ray {
  const reflectedSource = reflectPointThroughSegment(ray.source, surface.segment);
  const reflectedTarget = reflectPointThroughSegment(ray.target, surface.segment);

  return {
    source: reflectedSource,
    target: reflectedTarget,
    startRatio: ray.startRatio,
  };
}

/**
 * Check if a point lies on a ray (in the forward direction).
 *
 * Uses cross-product to check collinearity, then dot-product for direction.
 * EXACT check - no tolerance.
 *
 * @param ray The ray to check
 * @param point The point to test
 * @returns True if point is on the ray (forward from source)
 */
export function isPointOnRay(
  ray: Ray,
  point: Vector2
): boolean {
  const result = rayContainsPoint(ray, point);
  return result !== null;
}

/**
 * Get the parametric position of a point on a ray.
 *
 * Returns { t } where point = source + t * (target - source)
 * Returns null if point is not on the ray (behind source or off-line).
 * EXACT check - no tolerance.
 *
 * @param ray The ray
 * @param point The point to find
 * @returns { t } if point is on ray, null otherwise
 */
export function rayContainsPoint(
  ray: Ray,
  point: Vector2
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

  if (lenSq === 0) {
    // Degenerate ray - check if point is at source
    return (px === 0 && py === 0) ? { t: 0 } : null;
  }

  // Cross product for collinearity check (must be exactly zero)
  const cross = dx * py - dy * px;

  if (cross !== 0) {
    return null; // Point is off the ray line
  }

  // Dot product for parametric position
  const t = (dx * px + dy * py) / lenSq;

  // Point must be in forward direction (t >= 0)
  if (t < 0) {
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
  if (len === 0) {
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

