/**
 * SimpleVisibilityCalculator - First Principles Visibility Calculation
 *
 * Uses simple ray casting instead of complex cone propagation.
 *
 * First Principle: A point is lit iff there's direct line-of-sight from
 * the origin (player) to that point.
 *
 * Algorithm:
 * 1. Collect all surface endpoints + screen corners as "critical angles"
 * 2. For each critical angle, cast a ray from origin
 * 3. Find where ray hits first blocking surface (or screen edge)
 * 4. Sort hit points by angle (CCW)
 * 5. Return polygon vertices
 *
 * This is simpler and more robust than angular cone propagation.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";

/**
 * Screen bounds for visibility calculation.
 */
export interface ScreenBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Result of visibility calculation.
 */
export interface SimpleVisibilityResult {
  /** Polygon vertices in CCW order */
  readonly polygon: readonly Vector2[];
  /** Origin point (player position) */
  readonly origin: Vector2;
  /** Whether result is valid */
  readonly isValid: boolean;
}

/**
 * A ray with angle information.
 */
interface RayResult {
  /** Angle from origin */
  angle: number;
  /** Hit point */
  point: Vector2;
  /** Distance from origin */
  distance: number;
}

/**
 * Calculate visibility polygon using ray casting.
 *
 * For each surface endpoint and screen corner, we cast a ray from the origin
 * and find where it hits the first surface. The collection of hit points
 * forms the visibility polygon.
 *
 * To handle corner cases, we cast three rays for each critical angle:
 * - One exactly at the angle
 * - One slightly before (clockwise)
 * - One slightly after (counter-clockwise)
 */
export function calculateSimpleVisibility(
  origin: Vector2,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds
): SimpleVisibilityResult {
  // Collect all critical angles (surface endpoints + screen corners)
  const criticalAngles = collectCriticalAngles(origin, surfaces, screenBounds);

  if (criticalAngles.length === 0) {
    return {
      polygon: [],
      origin,
      isValid: false,
    };
  }

  // Cast rays and collect results
  const rayResults: RayResult[] = [];
  const epsilon = 0.0001; // Small angle offset for corner handling

  for (const angle of criticalAngles) {
    // Cast three rays: slightly before, exactly at, and slightly after
    for (const offset of [-epsilon, 0, epsilon]) {
      const adjustedAngle = angle + offset;
      const result = castRay(origin, adjustedAngle, surfaces, screenBounds);
      if (result) {
        rayResults.push(result);
      }
    }
  }

  // Sort by angle (CCW)
  rayResults.sort((a, b) => a.angle - b.angle);

  // Remove duplicates (same angle within epsilon)
  const uniqueResults = removeDuplicates(rayResults);

  // Extract polygon vertices
  const polygon = uniqueResults.map(r => r.point);

  return {
    polygon,
    origin,
    isValid: polygon.length >= 3,
  };
}

/**
 * Collect all critical angles from surface endpoints and screen corners.
 */
function collectCriticalAngles(
  origin: Vector2,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds
): number[] {
  const angles: number[] = [];

  // Add angles to surface endpoints
  for (const surface of surfaces) {
    const startAngle = Math.atan2(
      surface.segment.start.y - origin.y,
      surface.segment.start.x - origin.x
    );
    const endAngle = Math.atan2(
      surface.segment.end.y - origin.y,
      surface.segment.end.x - origin.x
    );

    angles.push(startAngle, endAngle);
  }

  // Add angles to screen corners
  const corners = [
    { x: screenBounds.minX, y: screenBounds.minY },
    { x: screenBounds.maxX, y: screenBounds.minY },
    { x: screenBounds.maxX, y: screenBounds.maxY },
    { x: screenBounds.minX, y: screenBounds.maxY },
  ];

  for (const corner of corners) {
    const angle = Math.atan2(corner.y - origin.y, corner.x - origin.x);
    angles.push(angle);
  }

  // Sort and remove duplicates
  angles.sort((a, b) => a - b);
  return angles.filter((angle, i, arr) => i === 0 || Math.abs(angle - arr[i - 1]!) > 0.0001);
}

/**
 * Cast a ray from origin at given angle and find first hit.
 */
function castRay(
  origin: Vector2,
  angle: number,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds
): RayResult | null {
  // Ray direction
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  // Find closest intersection with all surfaces
  let closestDist = Infinity;
  let closestPoint: Vector2 | null = null;

  for (const surface of surfaces) {
    const hit = raySegmentIntersection(
      origin,
      { x: dx, y: dy },
      surface.segment.start,
      surface.segment.end
    );

    if (hit && hit.t > 0.001 && hit.t < closestDist) {
      closestDist = hit.t;
      closestPoint = hit.point;
    }
  }

  // If no surface hit, find intersection with screen boundary
  if (!closestPoint) {
    closestPoint = findScreenBoundaryHit(origin, { x: dx, y: dy }, screenBounds);
    if (closestPoint) {
      closestDist = Math.sqrt(
        (closestPoint.x - origin.x) ** 2 + (closestPoint.y - origin.y) ** 2
      );
    }
  }

  if (!closestPoint) {
    return null;
  }

  return {
    angle,
    point: closestPoint,
    distance: closestDist,
  };
}

/**
 * Find intersection of ray with line segment.
 */
function raySegmentIntersection(
  rayOrigin: Vector2,
  rayDir: Vector2,
  segStart: Vector2,
  segEnd: Vector2
): { t: number; point: Vector2 } | null {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;

  const denom = rayDir.x * dy - rayDir.y * dx;
  if (Math.abs(denom) < 1e-10) {
    return null; // Parallel
  }

  const t = ((segStart.x - rayOrigin.x) * dy - (segStart.y - rayOrigin.y) * dx) / denom;
  const u = ((segStart.x - rayOrigin.x) * rayDir.y - (segStart.y - rayOrigin.y) * rayDir.x) / denom;

  if (t > 0 && u >= 0 && u <= 1) {
    return {
      t,
      point: {
        x: rayOrigin.x + t * rayDir.x,
        y: rayOrigin.y + t * rayDir.y,
      },
    };
  }

  return null;
}

/**
 * Find where ray hits screen boundary.
 */
function findScreenBoundaryHit(
  origin: Vector2,
  dir: Vector2,
  bounds: ScreenBounds
): Vector2 | null {
  let closestT = Infinity;
  let closestPoint: Vector2 | null = null;

  // Screen edges as segments
  const edges = [
    { start: { x: bounds.minX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.minY } }, // Top
    { start: { x: bounds.maxX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.maxY } }, // Right
    { start: { x: bounds.maxX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.maxY } }, // Bottom
    { start: { x: bounds.minX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.minY } }, // Left
  ];

  for (const edge of edges) {
    const hit = raySegmentIntersection(origin, dir, edge.start, edge.end);
    if (hit && hit.t > 0.001 && hit.t < closestT) {
      closestT = hit.t;
      closestPoint = hit.point;
    }
  }

  return closestPoint;
}

/**
 * Remove duplicate ray results (same angle within epsilon).
 */
function removeDuplicates(results: RayResult[]): RayResult[] {
  if (results.length === 0) return [];

  const unique: RayResult[] = [results[0]!];
  const angleEpsilon = 0.001;
  const distEpsilon = 1;

  for (let i = 1; i < results.length; i++) {
    const prev = unique[unique.length - 1]!;
    const curr = results[i]!;

    // Keep if angle or distance is significantly different
    if (
      Math.abs(curr.angle - prev.angle) > angleEpsilon ||
      Math.abs(curr.distance - prev.distance) > distEpsilon
    ) {
      unique.push(curr);
    }
  }

  return unique;
}

/**
 * Check if a point is inside the visibility polygon.
 */
export function isPointVisible(
  point: Vector2,
  result: SimpleVisibilityResult
): boolean {
  if (!result.isValid || result.polygon.length < 3) {
    return false;
  }

  // Ray casting algorithm for point-in-polygon
  let inside = false;
  const polygon = result.polygon;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x;
    const yi = polygon[i]!.y;
    const xj = polygon[j]!.x;
    const yj = polygon[j]!.y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

