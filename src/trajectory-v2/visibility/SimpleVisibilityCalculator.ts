/**
 * @deprecated This module is deprecated. Use AnalyticalPropagation.ts instead.
 *
 * SimpleVisibilityCalculator - First Principles Visibility Calculation
 *
 * DEPRECATED: This module has been superseded by AnalyticalPropagation.ts which
 * provides better polygon ordering (no self-intersection) and intermediate polygon
 * support for V.8/V.9 compliance.
 *
 * Use instead:
 * - buildVisibilityPolygon() from AnalyticalPropagation.ts
 * - propagateWithIntermediates() from AnalyticalPropagation.ts
 * - RayBasedVisibilityCalculator for the IVisibilityCalculator interface
 *
 * This module is kept only for backward compatibility with existing tests.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import {
  propagateVisibility,
  buildPolygonFromSections,
  type ScreenBounds as SectionScreenBounds,
} from "./SectionPropagator";
import {
  isCursorLit as isCursorLitRayBased,
  calculateRayVisibility,
  type RayVisibilityResult,
} from "./RayBasedVisibility";

// Re-export ray-based functions for gradual migration
export { isCursorLitRayBased, calculateRayVisibility, type RayVisibilityResult };

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
 * For planned surfaces, visibility is calculated by:
 * 1. Reflect the player through the planned surface to get "player image"
 * 2. Cast rays from the player image toward all surface endpoints
 * 3. Only include rays that PASS THROUGH the planned surface segment
 * 4. The hit points form the visibility polygon
 *
 * This is like looking through a mirror - you can see what's reflected,
 * but only through the physical mirror surface (not beyond its edges).
 */
function calculatePlannedVisibility(
  playerOrigin: Vector2,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds,
  plannedSurfaces: readonly Surface[]
): SimpleVisibilityResult {
  // Use section-based propagation for planned surfaces
  return calculateSectionBasedVisibility(
    playerOrigin,
    surfaces,
    screenBounds,
    plannedSurfaces
  );
}

/**
 * Calculate visibility using section-based propagation.
 *
 * This algorithm:
 * 1. Calculates which sections of each planned surface are visible
 * 2. Propagates sections through each surface via reflection
 * 3. Builds the final polygon from the propagated sections
 */
function calculateSectionBasedVisibility(
  playerOrigin: Vector2,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds,
  plannedSurfaces: readonly Surface[]
): SimpleVisibilityResult {
  if (plannedSurfaces.length === 0) {
    return {
      polygon: [],
      origin: playerOrigin,
      isValid: false,
    };
  }

  const sectionBounds: SectionScreenBounds = {
    minX: screenBounds.minX,
    minY: screenBounds.minY,
    maxX: screenBounds.maxX,
    maxY: screenBounds.maxY,
  };

  // Propagate visibility through all planned surfaces
  const propagation = propagateVisibility(playerOrigin, plannedSurfaces, surfaces);

  if (propagation.sections.length === 0) {
    return {
      polygon: [],
      origin: playerOrigin,
      isValid: false,
    };
  }

  // Build the polygon from the final sections
  // Pass playerOrigin for input-side obstruction checking (V.5 compliance)
  const lastPlannedSurface = plannedSurfaces[plannedSurfaces.length - 1]!;
  const polygon = buildPolygonFromSections(
    propagation,
    surfaces,
    sectionBounds,
    lastPlannedSurface,
    playerOrigin  // For input-side obstruction check
  );

  // CRITICAL: Return the propagation origin (player image) not the original player
  // The polygon vertices are calculated from the player image perspective,
  // so the origin must match for correct triangle fan rendering
  return {
    polygon,
    origin: propagation.origin,  // Use player image for planned surfaces
    isValid: polygon.length >= 3,
  };
}

/**
 * Calculate visibility through a single planned surface.
 *
 * Algorithm:
 * 1. Reflect player through the surface to get the "image"
 * 2. For angles that would pass through the surface segment:
 *    - Cast ray from image, find where it hits surfaces/bounds
 *    - These points are visible through reflection
 */
function calculateSingleSurfaceVisibility(
  playerOrigin: Vector2,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds,
  plannedSurface: Surface
): SimpleVisibilityResult {
  // Step 1: Reflect player through the planned surface
  const playerImage = reflectPointThroughLine(
    playerOrigin,
    plannedSurface.segment.start,
    plannedSurface.segment.end
  );

  // Step 2: Calculate the angular range that passes through the surface segment
  const surfaceStart = plannedSurface.segment.start;
  const surfaceEnd = plannedSurface.segment.end;

  const angleToStart = Math.atan2(
    surfaceStart.y - playerImage.y,
    surfaceStart.x - playerImage.x
  );
  const angleToEnd = Math.atan2(
    surfaceEnd.y - playerImage.y,
    surfaceEnd.x - playerImage.x
  );

  // Determine the angular range (handle wrap-around)
  let minAngle = Math.min(angleToStart, angleToEnd);
  let maxAngle = Math.max(angleToStart, angleToEnd);

  // Handle case where range crosses -PI/PI boundary
  if (maxAngle - minAngle > Math.PI) {
    // Swap and adjust
    const temp = minAngle;
    minAngle = maxAngle;
    maxAngle = temp + 2 * Math.PI;
  }

  // Step 3: Collect critical angles within this range
  const criticalAngles: number[] = [];

  // Add surface endpoints as critical angles
  criticalAngles.push(angleToStart, angleToEnd);

  // Add small offsets around surface endpoints to capture edges
  const epsilon = 0.0001;
  criticalAngles.push(angleToStart - epsilon, angleToStart + epsilon);
  criticalAngles.push(angleToEnd - epsilon, angleToEnd + epsilon);

  // Add angles to all other surface endpoints (within the valid range)
  for (const surface of surfaces) {
    for (const endpoint of [surface.segment.start, surface.segment.end]) {
      const angle = Math.atan2(
        endpoint.y - playerImage.y,
        endpoint.x - playerImage.x
      );

      if (isAngleInRange(angle, minAngle, maxAngle)) {
        criticalAngles.push(angle);
        criticalAngles.push(angle - epsilon, angle + epsilon);
      }
    }
  }

  // Add screen corners within range
  const corners = [
    { x: screenBounds.minX, y: screenBounds.minY },
    { x: screenBounds.maxX, y: screenBounds.minY },
    { x: screenBounds.maxX, y: screenBounds.maxY },
    { x: screenBounds.minX, y: screenBounds.maxY },
  ];

  for (const corner of corners) {
    const angle = Math.atan2(
      corner.y - playerImage.y,
      corner.x - playerImage.x
    );

    if (isAngleInRange(angle, minAngle, maxAngle)) {
      criticalAngles.push(angle);
    }
  }

  if (criticalAngles.length === 0) {
    return { polygon: [], origin: playerOrigin, isValid: false };
  }

  // Step 4: Cast rays from player image and collect hit points
  // Exclude the planned surface from ray casting (we're casting THROUGH it)
  const surfacesExcludingPlanned = surfaces.filter(s => s.id !== plannedSurface.id);

  const rayResults: RayResult[] = [];

  for (const angle of criticalAngles) {
    // Only process if angle is in valid range
    // Rays within this range automatically pass through the surface segment
    if (!isAngleInRange(angle, minAngle, maxAngle)) continue;

    // Cast ray from player image, excluding the planned surface
    const result = castRay(playerImage, angle, surfacesExcludingPlanned, screenBounds);
    if (result) {
      rayResults.push(result);
    }
  }

  // Normalize angles to the adjusted range
  let startAngleNormalized = angleToStart;
  let endAngleNormalized = angleToEnd;
  if (maxAngle > Math.PI) {
    if (startAngleNormalized < 0) startAngleNormalized += 2 * Math.PI;
    if (endAngleNormalized < 0) endAngleNormalized += 2 * Math.PI;
  }

  // Find the min/max angles for sorting
  const sortedEndpoints = [
    { point: surfaceStart, angle: startAngleNormalized, isSurface: true },
    { point: surfaceEnd, angle: endAngleNormalized, isSurface: true },
  ].sort((a, b) => a.angle - b.angle);

  const firstEndpoint = sortedEndpoints[0]!;
  const lastEndpoint = sortedEndpoints[1]!;

  // Collect ray hits with normalized angles
  const farBoundaryHits: Array<{ point: Vector2; angle: number }> = [];

  for (const result of rayResults) {
    let hitAngle = result.angle;
    if (maxAngle > Math.PI && hitAngle < 0) {
      hitAngle += 2 * Math.PI;
    }
    farBoundaryHits.push({ point: result.point, angle: hitAngle });
  }

  // Sort far boundary hits by angle
  farBoundaryHits.sort((a, b) => a.angle - b.angle);

  // Remove duplicate positions (keep distinct boundary points)
  const filteredHits: Vector2[] = [];
  const positionEpsilon = 1.0;

  for (const hit of farBoundaryHits) {
    // Skip if same position as a surface endpoint
    const sameAsFirst = 
      Math.abs(hit.point.x - firstEndpoint.point.x) < positionEpsilon &&
      Math.abs(hit.point.y - firstEndpoint.point.y) < positionEpsilon;
    const sameAsLast = 
      Math.abs(hit.point.x - lastEndpoint.point.x) < positionEpsilon &&
      Math.abs(hit.point.y - lastEndpoint.point.y) < positionEpsilon;
    if (sameAsFirst || sameAsLast) continue;

    // Skip if duplicate position with already-added hit
    const isDup = filteredHits.some(existing =>
      Math.abs(existing.x - hit.point.x) < positionEpsilon &&
      Math.abs(existing.y - hit.point.y) < positionEpsilon
    );
    if (isDup) continue;

    filteredHits.push(hit.point);
  }

  // Build polygon: first_surface_endpoint → far_hits → last_surface_endpoint
  const polygon: Vector2[] = [
    firstEndpoint.point,
    ...filteredHits,
    lastEndpoint.point,
  ];

  return {
    polygon,
    origin: playerOrigin,
    isValid: polygon.length >= 3,
  };
}

/**
 * Check if an angle is within a range (handles wrap-around).
 */
function isAngleInRange(angle: number, minAngle: number, maxAngle: number): boolean {
  // Normalize angle to same range
  let normalized = angle;
  if (maxAngle > Math.PI && angle < 0) {
    normalized = angle + 2 * Math.PI;
  }

  return normalized >= minAngle - 0.001 && normalized <= maxAngle + 0.001;
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
  const positionEpsilon = 0.5; // Pixels

  for (let i = 1; i < results.length; i++) {
    const prev = unique[unique.length - 1]!;
    const curr = results[i]!;

    // Keep if position is significantly different
    const dx = curr.point.x - prev.point.x;
    const dy = curr.point.y - prev.point.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > positionEpsilon) {
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

