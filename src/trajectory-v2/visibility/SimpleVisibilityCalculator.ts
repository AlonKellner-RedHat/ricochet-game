/**
 * SimpleVisibilityCalculator - First Principles Visibility Calculation
 *
 * Uses simple ray casting instead of complex cone propagation.
 *
 * First Principles:
 * - For empty plan: A point is lit iff there's direct line-of-sight from player
 * - For plan with surfaces: A point is lit iff it's on the reflective side of
 *   the last planned surface AND there's line-of-sight from the reflected origin
 *
 * V.5: Light reaches cursor ↔ (plan valid AND aligned)
 *
 * Algorithm:
 * 1. If planned surfaces exist:
 *    a. Reflect player through each surface to get "reflected origin"
 *    b. Cast rays from reflected origin
 *    c. Filter vertices to reflective side of last planned surface
 * 2. Otherwise: simple line-of-sight from player
 * 3. For each critical angle, cast a ray from origin
 * 4. Find where ray hits first blocking surface (or screen edge)
 * 5. Sort hit points by angle (CCW)
 * 6. Return polygon vertices
 *
 * This is simpler and more robust than angular cone propagation.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";

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
 * For planned surfaces:
 * - Reflect origin through planned surfaces
 * - Cast rays from reflected origin
 * - Filter results to only include points on the reflective side
 *
 * To handle corner cases, we cast three rays for each critical angle:
 * - One exactly at the angle
 * - One slightly before (clockwise)
 * - One slightly after (counter-clockwise)
 *
 * @param origin Player position
 * @param surfaces All surfaces in the scene
 * @param screenBounds Screen boundaries
 * @param plannedSurfaces Optional planned surfaces (affects visibility region)
 */
export function calculateSimpleVisibility(
  origin: Vector2,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds,
  plannedSurfaces: readonly Surface[] = []
): SimpleVisibilityResult {
  // If we have planned surfaces, calculate visibility from reflected origin
  // constrained to the reflective side of the last planned surface
  if (plannedSurfaces.length > 0) {
    return calculatePlannedVisibility(origin, surfaces, screenBounds, plannedSurfaces);
  }

  // No planned surfaces: simple line-of-sight visibility
  return calculateDirectVisibility(origin, surfaces, screenBounds);
}

/**
 * Calculate direct line-of-sight visibility (no planned surfaces).
 */
function calculateDirectVisibility(
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
 * Calculate visibility with planned surfaces.
 *
 * V.5 First Principle: Light reaches cursor ↔ (plan valid AND aligned)
 *
 * For planned surfaces, the visibility is the REFLECTIVE HALF-PLANE
 * of the last planned surface, intersected with the screen bounds.
 *
 * The reflective side is the side OPPOSITE to where the player is standing.
 *
 * This is a simplified approach: instead of complex ray tracing through
 * reflections, we simply constrain visibility to the half-plane.
 */
function calculatePlannedVisibility(
  playerOrigin: Vector2,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds,
  plannedSurfaces: readonly Surface[]
): SimpleVisibilityResult {
  // Get the last planned surface
  const lastPlannedSurface = plannedSurfaces[plannedSurfaces.length - 1]!;

  // Determine which side of the surface the player is on
  const playerSide = getSideOfLine(playerOrigin, lastPlannedSurface);

  // The visibility region is the half-plane on the OPPOSITE side from the player
  // We need to construct a polygon that covers this half-plane within screen bounds
  const halfPlanePolygon = constructHalfPlanePolygon(
    lastPlannedSurface,
    playerSide,
    screenBounds
  );

  if (halfPlanePolygon.length < 3) {
    return {
      polygon: [],
      origin: playerOrigin,
      isValid: false,
    };
  }

  return {
    polygon: halfPlanePolygon,
    origin: playerOrigin,
    isValid: true,
  };
}

/**
 * Construct a polygon representing the half-plane on the opposite side
 * of a surface from the player, clipped to screen bounds.
 */
function constructHalfPlanePolygon(
  surface: Surface,
  playerSide: number,
  screenBounds: ScreenBounds
): Vector2[] {
  // Screen corners
  const corners = [
    { x: screenBounds.minX, y: screenBounds.minY },
    { x: screenBounds.maxX, y: screenBounds.minY },
    { x: screenBounds.maxX, y: screenBounds.maxY },
    { x: screenBounds.minX, y: screenBounds.maxY },
  ];

  // Find corners on the reflective side (opposite from player)
  const reflectiveSideCorners = corners.filter(corner => {
    const side = getSideOfLine(corner, surface);
    return side !== playerSide && side !== 0;
  });

  // Find where the surface line (extended) intersects screen edges
  const intersections = findSurfaceScreenIntersections(surface, screenBounds);

  // Combine corners and intersections, all on reflective side
  const allPoints: Vector2[] = [...reflectiveSideCorners, ...intersections];

  if (allPoints.length < 3) {
    // If not enough points, the entire screen might be on one side
    // Check if most corners are on reflective side
    const reflectiveCount = corners.filter(c => getSideOfLine(c, surface) !== playerSide).length;
    if (reflectiveCount >= 3) {
      // Return all corners on reflective side
      return corners.filter(c => getSideOfLine(c, surface) !== playerSide);
    }
    return [];
  }

  // Sort points by angle from center of the polygon
  const centerX = allPoints.reduce((sum, p) => sum + p.x, 0) / allPoints.length;
  const centerY = allPoints.reduce((sum, p) => sum + p.y, 0) / allPoints.length;

  allPoints.sort((a, b) => {
    const angleA = Math.atan2(a.y - centerY, a.x - centerX);
    const angleB = Math.atan2(b.y - centerY, b.x - centerX);
    return angleA - angleB;
  });

  return allPoints;
}

/**
 * Find where the surface line (extended infinitely) intersects screen edges.
 */
function findSurfaceScreenIntersections(
  surface: Surface,
  screenBounds: ScreenBounds
): Vector2[] {
  const { start, end } = surface.segment;
  const intersections: Vector2[] = [];

  // Direction of the surface line
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // Screen edges
  const edges = [
    { p1: { x: screenBounds.minX, y: screenBounds.minY }, p2: { x: screenBounds.maxX, y: screenBounds.minY } }, // Top
    { p1: { x: screenBounds.maxX, y: screenBounds.minY }, p2: { x: screenBounds.maxX, y: screenBounds.maxY } }, // Right
    { p1: { x: screenBounds.maxX, y: screenBounds.maxY }, p2: { x: screenBounds.minX, y: screenBounds.maxY } }, // Bottom
    { p1: { x: screenBounds.minX, y: screenBounds.maxY }, p2: { x: screenBounds.minX, y: screenBounds.minY } }, // Left
  ];

  for (const edge of edges) {
    const intersection = lineLineIntersection(start, { x: dx, y: dy }, edge.p1, edge.p2);
    if (intersection && 
        intersection.x >= screenBounds.minX - 0.1 && intersection.x <= screenBounds.maxX + 0.1 &&
        intersection.y >= screenBounds.minY - 0.1 && intersection.y <= screenBounds.maxY + 0.1) {
      // Check if this intersection is within the edge segment
      const edgeDx = edge.p2.x - edge.p1.x;
      const edgeDy = edge.p2.y - edge.p1.y;
      const t = Math.abs(edgeDx) > Math.abs(edgeDy) 
        ? (intersection.x - edge.p1.x) / edgeDx
        : (intersection.y - edge.p1.y) / edgeDy;
      
      if (t >= -0.01 && t <= 1.01) {
        intersections.push(intersection);
      }
    }
  }

  return intersections;
}

/**
 * Find intersection of line through p1 with direction d, and segment from p2 to p3.
 */
function lineLineIntersection(
  p1: Vector2,
  d: Vector2,
  p2: Vector2,
  p3: Vector2
): Vector2 | null {
  const dx2 = p3.x - p2.x;
  const dy2 = p3.y - p2.y;

  const denom = d.x * dy2 - d.y * dx2;
  if (Math.abs(denom) < 1e-10) {
    return null; // Parallel
  }

  const t = ((p2.x - p1.x) * dy2 - (p2.y - p1.y) * dx2) / denom;

  return {
    x: p1.x + t * d.x,
    y: p1.y + t * d.y,
  };
}

/**
 * Determine which side of a line a point is on.
 * Returns: 1 for one side, -1 for the other, 0 if on the line.
 */
function getSideOfLine(point: Vector2, surface: Surface): number {
  const { start, end } = surface.segment;
  
  // Cross product of (end - start) and (point - start)
  const cross = (end.x - start.x) * (point.y - start.y) - 
                (end.y - start.y) * (point.x - start.x);
  
  if (Math.abs(cross) < 0.001) return 0;
  return cross > 0 ? 1 : -1;
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

