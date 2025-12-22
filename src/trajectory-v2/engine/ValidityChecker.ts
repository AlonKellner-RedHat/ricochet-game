/**
 * ValidityChecker - Validates hits and checks for obstructions
 *
 * Provides functions to:
 * - Check if a hit is on the segment (vs extended line)
 * - Count obstructions between two points
 * - Determine which side of a surface a point is on
 */

import {
  isOnSegment,
  lineLineIntersection,
  pointSideOfLine,
  raySegmentIntersect,
} from "@/trajectory-v2/geometry/GeometryOps";
import type { Ray, Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";

/**
 * Check if a parametric hit value is on the segment.
 *
 * @param segmentT Parametric position along segment (0 = start, 1 = end)
 * @param tolerance Tolerance for floating-point comparisons
 * @returns True if hit is on the segment
 */
export function isHitOnSegment(segmentT: number, tolerance = 1e-6): boolean {
  return isOnSegment(segmentT, tolerance);
}

/**
 * Calculate the parametric position of a point along a segment.
 *
 * @param point The point to check
 * @param segStart Segment start
 * @param segEnd Segment end
 * @returns Parametric position (0 = at start, 1 = at end, outside [0,1] = off segment)
 */
export function getParametricPosition(
  point: Vector2,
  segStart: Vector2,
  segEnd: Vector2
): number {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq < 1e-10) {
    return 0; // Degenerate segment
  }

  const px = point.x - segStart.x;
  const py = point.y - segStart.y;

  return (px * dx + py * dy) / lengthSq;
}

/**
 * Count how many surfaces obstruct the path between two points.
 *
 * An obstruction is a surface whose segment intersects the path.
 *
 * @param from Start point
 * @param to End point
 * @param surfaces List of surfaces to check
 * @param excludeSurfaces Surfaces to exclude from check (e.g., planned surfaces)
 * @returns Number of obstructing surfaces
 */
export function countObstructions(
  from: Vector2,
  to: Vector2,
  surfaces: readonly Surface[],
  excludeSurfaces: readonly Surface[] = []
): number {
  let count = 0;

  for (const surface of surfaces) {
    // Skip excluded surfaces
    if (excludeSurfaces.includes(surface)) {
      continue;
    }

    const segment = surface.segment;
    const result = lineLineIntersection(from, to, segment.start, segment.end);

    if (!result.valid) {
      continue;
    }

    // Check if intersection is between from and to (t ∈ (0, 1))
    // and on the segment (s ∈ [0, 1])
    const isOnPath = result.t > 1e-6 && result.t < 1 - 1e-6;
    const isOnSeg = isOnSegment(result.s, 1e-6);

    if (isOnPath && isOnSeg) {
      count++;
    }
  }

  return count;
}

/**
 * Find the first obstructing surface between two points.
 *
 * @param from Start point
 * @param to End point
 * @param surfaces List of surfaces to check
 * @param excludeSurfaces Surfaces to exclude from check
 * @returns The first obstruction, or null if path is clear
 */
export function findFirstObstruction(
  from: Vector2,
  to: Vector2,
  surfaces: readonly Surface[],
  excludeSurfaces: readonly Surface[] = []
): { surface: Surface; point: Vector2; t: number } | null {
  let closest: { surface: Surface; point: Vector2; t: number } | null = null;

  for (const surface of surfaces) {
    // Skip excluded surfaces
    if (excludeSurfaces.includes(surface)) {
      continue;
    }

    const segment = surface.segment;
    const result = lineLineIntersection(from, to, segment.start, segment.end);

    if (!result.valid) {
      continue;
    }

    // Check if intersection is between from and to (t ∈ (0, 1))
    // and on the segment (s ∈ [0, 1])
    const isOnPath = result.t > 1e-6 && result.t < 1 - 1e-6;
    const isOnSeg = isOnSegment(result.s, 1e-6);

    if (isOnPath && isOnSeg) {
      if (!closest || result.t < closest.t) {
        closest = {
          surface,
          point: result.point,
          t: result.t,
        };
      }
    }
  }

  return closest;
}

/**
 * Determine which side of a surface a point is on.
 *
 * @param point The point to check
 * @param surface The surface
 * @returns Positive if on "front" side, negative if on "back", near-zero if on line
 */
export function getSideOfSurface(point: Vector2, surface: Surface): number {
  const segment = surface.segment;
  return pointSideOfLine(point, segment.start, segment.end);
}

/**
 * Check if a point is on the "correct" (reflective) side of a surface.
 *
 * @param point The point to check
 * @param surface The surface
 * @returns True if point can interact with the reflective side
 */
export function isOnReflectiveSide(
  point: Vector2,
  surface: Surface
): boolean {
  const side = getSideOfSurface(point, surface);
  const normal = surface.getNormal();

  // The normal points toward the "front" (reflective) side
  // Check if the point is on the same side as the normal points
  const segment = surface.segment;
  const midpoint = {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2,
  };

  // Point on the normal side
  const normalPoint = {
    x: midpoint.x + normal.x,
    y: midpoint.y + normal.y,
  };

  const normalSide = pointSideOfLine(normalPoint, segment.start, segment.end);

  // Point is on reflective side if it's on the same side as the normal
  return (side > 0 && normalSide > 0) || (side < 0 && normalSide < 0);
}

/**
 * Check if an arrow approaching from a direction can reflect off a surface.
 *
 * @param direction The incoming direction (from source to hit point)
 * @param surface The surface
 * @returns True if reflection is possible
 */
export function canReflectFromDirection(
  direction: Vector2,
  surface: Surface
): boolean {
  return surface.canReflectFrom(direction);
}

/**
 * Result of validating a hit.
 */
export interface HitValidation {
  /** Whether the hit is on the segment */
  readonly onSegment: boolean;
  /** Parametric position along segment */
  readonly segmentT: number;
  /** Whether the hit is from the correct side for reflection */
  readonly correctSide: boolean;
  /** Whether the path to hit was obstructed */
  readonly obstructed: boolean;
  /** The obstruction surface, if any */
  readonly obstruction?: Surface;
}

/**
 * Validate a hit comprehensively.
 *
 * @param from Source point (e.g., player or previous hit)
 * @param hitPoint The intersection point
 * @param surface The surface hit
 * @param allSurfaces All surfaces in the scene
 * @param excludeSurfaces Surfaces to exclude from obstruction check
 * @returns Comprehensive hit validation
 */
export function validateHit(
  from: Vector2,
  hitPoint: Vector2,
  surface: Surface,
  allSurfaces: readonly Surface[],
  excludeSurfaces: readonly Surface[] = []
): HitValidation {
  const segment = surface.segment;

  // Calculate parametric position on segment
  const segmentT = getParametricPosition(hitPoint, segment.start, segment.end);
  const onSegment = isHitOnSegment(segmentT);

  // Check if from correct side
  const direction = {
    x: hitPoint.x - from.x,
    y: hitPoint.y - from.y,
  };
  const correctSide = surface.canReflectFrom(direction);

  // Check for obstructions (excluding the surface being hit)
  const obstruction = findFirstObstruction(from, hitPoint, allSurfaces, [
    ...excludeSurfaces,
    surface,
  ]);

  return {
    onSegment,
    segmentT,
    correctSide,
    obstructed: obstruction !== null,
    obstruction: obstruction?.surface,
  };
}

/**
 * Result of a forward raycast.
 */
export interface RaycastHit {
  /** The surface that was hit */
  readonly surface: Surface;
  /** The intersection point */
  readonly point: Vector2;
  /** Parametric position along the ray (distance in ray units) */
  readonly t: number;
  /** Parametric position along the surface segment (0-1 if on segment) */
  readonly segmentT: number;
  /** Whether the surface can be reflected off from this direction */
  readonly canReflect: boolean;
  /** The incoming direction (for reflection calculation) */
  readonly incomingDirection: Vector2;
}

/**
 * Cast a ray forward and find the first intersection with any surface SEGMENT.
 *
 * This is the core of forward physics - it finds what the ray actually hits,
 * not what the planned path says it should hit.
 *
 * First Principles:
 * - Only hits on the actual segment count (not extended line)
 * - Returns the CLOSEST hit (smallest positive t)
 * - Direction can be derived from images but hits are physics-based
 *
 * @param from Starting point of the ray
 * @param direction Direction to cast (not normalized, just indicates direction)
 * @param surfaces All surfaces to check for intersection
 * @param excludeSurfaces Surfaces to skip (e.g., surface we just reflected off)
 * @param maxDistance Maximum distance to cast (optional, for performance)
 * @returns The first hit, or null if no intersection
 */
/**
 * Find intersection of a ray with the extended LINE of a surface (not just the segment).
 * Used for planned surfaces where we want to reflect even if the hit is off-segment.
 *
 * @param from Ray origin
 * @param direction Ray direction (normalized)
 * @param surface Surface to intersect with
 * @param maxDistance Maximum distance to check
 * @returns Intersection info or null if no intersection in forward direction
 */
export function rayLineIntersect(
  from: Vector2,
  direction: Vector2,
  surface: Surface,
  maxDistance = 10000
): { point: Vector2; t: number; isOnSegment: boolean } | null {
  const to: Vector2 = {
    x: from.x + direction.x * maxDistance,
    y: from.y + direction.y * maxDistance,
  };

  const segment = surface.segment;
  
  // Calculate intersection with the extended line
  const result = lineLineIntersection(from, to, segment.start, segment.end);
  
  if (!result.valid) {
    return null; // Lines are parallel
  }
  
  const intersectionPoint = result.point;
  
  // Check if intersection is in the forward direction (t > 0)
  const dx = intersectionPoint.x - from.x;
  const dy = intersectionPoint.y - from.y;
  const dot = dx * direction.x + dy * direction.y;
  
  if (dot <= 0) {
    return null; // Intersection is behind or at the ray origin
  }
  
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  // Check if intersection is on the actual segment (s is parametric position on segment)
  const onSegment = result.s >= -0.001 && result.s <= 1.001;
  
  return {
    point: intersectionPoint,
    t: dist,
    isOnSegment: onSegment,
  };
}

export function raycastForward(
  from: Vector2,
  direction: Vector2,
  surfaces: readonly Surface[],
  excludeSurfaces: readonly Surface[] = [],
  maxDistance = 10000
): RaycastHit | null {
  // Create ray endpoint far in the direction
  const to: Vector2 = {
    x: from.x + direction.x * maxDistance,
    y: from.y + direction.y * maxDistance,
  };

  const ray: Ray = { from, to };

  let closest: RaycastHit | null = null;
  let closestT = Number.POSITIVE_INFINITY;

  for (const surface of surfaces) {
    // Skip excluded surfaces
    if (excludeSurfaces.includes(surface)) {
      continue;
    }

    const segment = surface.segment;
    const result = raySegmentIntersect(ray, segment.start, segment.end);

    // Only consider hits that are:
    // 1. Valid (ray and segment not parallel)
    // 2. In front of the ray origin (t > 0)
    // 3. On the actual segment (not extended line)
    // 4. Closer than previous hit
    if (result.hit && result.t > 1e-6 && result.t < closestT) {
      // Calculate if surface can be reflected from this direction
      const canReflect = surface.canReflectFrom(direction);

      closest = {
        surface,
        point: result.point,
        t: result.t,
        segmentT: result.s,
        canReflect,
        incomingDirection: direction,
      };
      closestT = result.t;
    }
  }

  return closest;
}

/**
 * Reflect a direction vector through a surface.
 *
 * Uses the surface's segment to determine the reflection plane.
 *
 * @param direction The incoming direction
 * @param surface The surface to reflect off
 * @returns The reflected direction
 */
export function reflectDirection(
  direction: Vector2,
  surface: Surface
): Vector2 {
  const segment = surface.segment;

  // Line direction (tangent to surface)
  const tx = segment.end.x - segment.start.x;
  const ty = segment.end.y - segment.start.y;

  // Normal (perpendicular to tangent)
  // Using right-hand perpendicular: (tx, ty) → (-ty, tx)
  const lengthSq = tx * tx + ty * ty;
  if (lengthSq < 1e-10) {
    return direction; // Degenerate segment
  }

  // Normalized normal (we need to normalize for reflection formula)
  const len = Math.sqrt(lengthSq);
  const nx = -ty / len;
  const ny = tx / len;

  // Reflection formula: r = d - 2(d·n)n
  const dotDN = direction.x * nx + direction.y * ny;

  return {
    x: direction.x - 2 * dotDN * nx,
    y: direction.y - 2 * dotDN * ny,
  };
}

