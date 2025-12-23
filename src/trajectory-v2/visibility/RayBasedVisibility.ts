/**
 * RayBasedVisibility - Visibility Calculation Using ImageChain Rays
 *
 * This module calculates visibility polygons using the same ray-based
 * approach as trajectory calculation, ensuring V.5 correlation:
 * Light reaches cursor ↔ (plan valid AND aligned)
 *
 * First Principles:
 * 1. Visibility is defined by rays, not angles
 * 2. For planned surfaces, use ImageChain to get reflection geometry
 * 3. A cursor position is "lit" iff its ImageChain shows no divergence
 * 4. The visibility polygon is built from rays to surface endpoints
 *
 * Key Insight: Instead of casting rays at angles and checking if they pass
 * through the planned surface, we use rays defined by surface endpoints
 * and their images through the planned surface.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import { createImageChain, type ImageChain } from "@/trajectory-v2/engine/ImageChain";
import {
  type Ray,
  type Segment,
  intersectRaySegment,
  createRay,
} from "@/trajectory-v2/geometry/RayCore";
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
 * Result of ray-based visibility calculation.
 */
export interface RayVisibilityResult {
  /** Polygon vertices (CCW order from origin) */
  readonly polygon: readonly Vector2[];
  /** Origin point for rendering (may be player image for planned surfaces) */
  readonly origin: Vector2;
  /** The rays used to build the polygon */
  readonly rays: readonly Ray[];
  /** Whether result is valid */
  readonly isValid: boolean;
}

/**
 * Check if a cursor position is valid (lit) based on ImageChain.
 *
 * This is the core V.5 check: a cursor is lit iff the trajectory from
 * player to cursor (through planned surfaces) is valid and aligned.
 *
 * "Valid" means:
 * - All reflection points are on-segment
 * - Player is on reflective side of all planned surfaces
 * - Cursor is on reflective side of last planned surface
 *
 * @param player Player position
 * @param cursor Cursor position
 * @param plannedSurfaces Ordered planned surfaces
 * @param allSurfaces All surfaces (for obstruction checking)
 * @returns True if cursor is reachable (should be lit)
 */
export function isCursorLit(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[]
): boolean {
  if (plannedSurfaces.length === 0) {
    // No plan: cursor is lit iff direct line-of-sight exists
    return hasDirectLineOfSight(player, cursor, allSurfaces);
  }

  // Create ImageChain for this player-cursor pair
  const chain = createImageChain(player, cursor, plannedSurfaces);

  // Check 1: Player must be on reflective side of first planned surface
  if (!chain.isPlayerOnReflectiveSide(0)) {
    return false;
  }

  // Check 2: Cursor must be on reflective side of last planned surface
  const lastIndex = plannedSurfaces.length - 1;
  if (!chain.isCursorOnReflectiveSide(lastIndex)) {
    return false;
  }

  // Check 3: All reflection points must be on segment
  for (let i = 0; i < plannedSurfaces.length; i++) {
    if (!chain.isReflectionOnSegment(i)) {
      return false;
    }
  }

  // Check 4: No obstacles blocking the path
  // Check each segment of the path for obstructions
  const rays = chain.getAllRays();
  for (let i = 0; i < rays.length; i++) {
    const ray = rays[i]!;
    const segmentEnd = ray.target;

    // Find surfaces that might obstruct this segment
    const obstacles = allSurfaces.filter((s) => {
      // Don't count planned surfaces as obstacles for their segment
      if (i < plannedSurfaces.length && s.id === plannedSurfaces[i]!.id) {
        return false;
      }
      return true;
    });

    for (const obstacle of obstacles) {
      const segment: Segment = {
        start: obstacle.segment.start,
        end: obstacle.segment.end,
      };

      const hit = intersectRaySegment(ray, segment);

      if (hit && hit.onSegment && hit.t > 0.001) {
        // Check if hit is before the segment end
        const rayLength = distance(ray.source, segmentEnd);
        const hitDist = distance(ray.source, hit.point);

        if (hitDist < rayLength - 1) {
          // Obstruction before target
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Calculate visibility polygon using ray-based approach.
 *
 * For planned surfaces, the polygon is built from rays that pass through
 * the "window" defined by each planned surface segment.
 *
 * @param player Player position
 * @param surfaces All surfaces in the scene
 * @param screenBounds Screen boundaries
 * @param plannedSurfaces Optional planned surfaces
 * @returns Visibility polygon result
 */
export function calculateRayVisibility(
  player: Vector2,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds,
  plannedSurfaces: readonly Surface[] = []
): RayVisibilityResult {
  if (plannedSurfaces.length === 0) {
    return calculateDirectRayVisibility(player, surfaces, screenBounds);
  }

  return calculatePlannedRayVisibility(player, surfaces, screenBounds, plannedSurfaces);
}

/**
 * Calculate direct line-of-sight visibility using rays with grazing ray technique.
 *
 * For each surface endpoint, we cast THREE rays:
 * 1. Before ray: angle - ε (may hit the surface)
 * 2. Exact ray: exactly at endpoint
 * 3. After ray: angle + ε (extends past obstacle to find shadow edge)
 *
 * This properly captures shadow boundaries that the simple algorithm misses.
 */
function calculateDirectRayVisibility(
  origin: Vector2,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds
): RayVisibilityResult {
  const epsilon = 0.0001;
  
  // Collect angle data for all critical directions
  const rayData: { angle: number; point: Vector2 | null }[] = [];

  // Add surface endpoints with grazing rays
  for (const surface of surfaces) {
    for (const endpoint of [surface.segment.start, surface.segment.end]) {
      const angle = Math.atan2(endpoint.y - origin.y, endpoint.x - origin.x);

      // Ray before endpoint (angle - ε)
      const beforeAngle = angle - epsilon;
      const beforeHit = castRayAtAngle(origin, beforeAngle, surfaces, screenBounds);
      if (beforeHit) {
        rayData.push({ angle: beforeAngle, point: beforeHit });
      }

      // Ray exactly at endpoint
      const exactRay = createRay(origin, endpoint);
      const exactHit = castRayToFirstSurface(exactRay, origin, surfaces, screenBounds);
      if (exactHit) {
        rayData.push({ angle, point: exactHit });
      }

      // Ray after endpoint (angle + ε) - grazing ray
      const afterAngle = angle + epsilon;
      const afterHit = castRayAtAngle(origin, afterAngle, surfaces, screenBounds);
      if (afterHit) {
        rayData.push({ angle: afterAngle, point: afterHit });
      }
    }
  }

  // Add screen corners
  const corners = [
    { x: screenBounds.minX, y: screenBounds.minY },
    { x: screenBounds.maxX, y: screenBounds.minY },
    { x: screenBounds.maxX, y: screenBounds.maxY },
    { x: screenBounds.minX, y: screenBounds.maxY },
  ];

  for (const corner of corners) {
    const angle = Math.atan2(corner.y - origin.y, corner.x - origin.x);
    const ray = createRay(origin, corner);
    const hit = castRayToFirstSurface(ray, origin, surfaces, screenBounds);
    if (hit) {
      rayData.push({ angle, point: hit });
    }
  }

  // Sort by angle (CCW)
  rayData.sort((a, b) => a.angle - b.angle);

  // Extract polygon points
  const polygon: Vector2[] = rayData
    .map((r) => r.point)
    .filter((p): p is Vector2 => p !== null);

  // Create rays for debugging
  const rays: Ray[] = rayData.map((r) => {
    const farPoint = {
      x: origin.x + Math.cos(r.angle) * 10000,
      y: origin.y + Math.sin(r.angle) * 10000,
    };
    return createRay(origin, farPoint);
  });

  // Remove duplicate points
  const uniquePolygon = removeDuplicatePoints(polygon);

  return {
    polygon: uniquePolygon,
    origin,
    rays,
    isValid: uniquePolygon.length >= 3,
  };
}

/**
 * Cast a ray at a specific angle and find the first surface hit.
 */
function castRayAtAngle(
  origin: Vector2,
  angle: number,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds
): Vector2 | null {
  // Create a ray extending far in the given direction
  const farPoint = {
    x: origin.x + Math.cos(angle) * 10000,
    y: origin.y + Math.sin(angle) * 10000,
  };
  
  const ray = createRay(origin, farPoint);
  return castRayToFirstSurface(ray, origin, surfaces, screenBounds);
}

/**
 * Calculate visibility through planned surfaces using rays.
 */
function calculatePlannedRayVisibility(
  player: Vector2,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds,
  plannedSurfaces: readonly Surface[]
): RayVisibilityResult {
  // Reflect player through all planned surfaces to get "player image"
  let playerImage = player;
  for (const surface of plannedSurfaces) {
    playerImage = reflectPointThroughLine(
      playerImage,
      surface.segment.start,
      surface.segment.end
    );
  }

  // The last planned surface acts as a "window" - only rays passing through
  // this window are valid
  const lastSurface = plannedSurfaces[plannedSurfaces.length - 1]!;

  // Collect critical points that would be visible through the window
  const criticalPoints: Vector2[] = [];

  // Add last surface endpoints (window bounds)
  criticalPoints.push(lastSurface.segment.start);
  criticalPoints.push(lastSurface.segment.end);

  // Add other surface endpoints that are on the correct side
  for (const surface of surfaces) {
    if (surface.id === lastSurface.id) continue;

    for (const endpoint of [surface.segment.start, surface.segment.end]) {
      // Check if ray from playerImage through this point passes through the window
      if (rayPassesThroughWindow(playerImage, endpoint, lastSurface)) {
        criticalPoints.push(endpoint);
      }
    }
  }

  // Add screen corners that are visible through the window
  const corners = [
    { x: screenBounds.minX, y: screenBounds.minY },
    { x: screenBounds.maxX, y: screenBounds.minY },
    { x: screenBounds.maxX, y: screenBounds.maxY },
    { x: screenBounds.minX, y: screenBounds.maxY },
  ];

  for (const corner of corners) {
    if (rayPassesThroughWindow(playerImage, corner, lastSurface)) {
      criticalPoints.push(corner);
    }
  }

  if (criticalPoints.length < 2) {
    return {
      polygon: [],
      origin: playerImage,
      rays: [],
      isValid: false,
    };
  }

  // Sort points by angle from player image (CCW)
  const sortedPoints = [...criticalPoints].sort((a, b) => {
    const angleA = Math.atan2(a.y - playerImage.y, a.x - playerImage.x);
    const angleB = Math.atan2(b.y - playerImage.y, b.x - playerImage.x);
    return angleA - angleB;
  });

  // Cast rays from player image
  const rays: Ray[] = [];
  const polygon: Vector2[] = [];

  // Filter surfaces to not include the planned surfaces (we cast through them)
  const obstacleSurfaces = surfaces.filter(
    (s) => !plannedSurfaces.some((ps) => ps.id === s.id)
  );

  for (const point of sortedPoints) {
    const ray = createRay(playerImage, point);
    const hitPoint = castRayToFirstSurface(ray, playerImage, obstacleSurfaces, screenBounds);

    rays.push(ray);
    if (hitPoint) {
      polygon.push(hitPoint);
    }
  }

  // Remove duplicate points
  const uniquePolygon = removeDuplicatePoints(polygon);

  return {
    polygon: uniquePolygon,
    origin: playerImage,
    rays,
    isValid: uniquePolygon.length >= 3,
  };
}

/**
 * Check if a ray from origin through point passes through a surface segment.
 */
function rayPassesThroughWindow(
  origin: Vector2,
  point: Vector2,
  window: Surface
): boolean {
  const ray = createRay(origin, point);
  const segment: Segment = {
    start: window.segment.start,
    end: window.segment.end,
  };

  const hit = intersectRaySegment(ray, segment);

  // Ray must hit the window, on the segment, in the forward direction
  return hit !== null && hit.onSegment && hit.t > 0;
}

/**
 * Cast a ray and find the first surface hit.
 */
function castRayToFirstSurface(
  ray: Ray,
  origin: Vector2,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds
): Vector2 | null {
  let closestHit: { point: Vector2; t: number } | null = null;

  // Check intersection with each surface
  for (const surface of surfaces) {
    const segment: Segment = {
      start: surface.segment.start,
      end: surface.segment.end,
    };

    const hit = intersectRaySegment(ray, segment);

    if (hit && hit.onSegment && hit.t > 0.001) {
      if (!closestHit || hit.t < closestHit.t) {
        closestHit = { point: hit.point, t: hit.t };
      }
    }
  }

  // Check intersection with screen bounds
  const screenSegments: Segment[] = [
    { start: { x: screenBounds.minX, y: screenBounds.minY }, end: { x: screenBounds.maxX, y: screenBounds.minY } },
    { start: { x: screenBounds.maxX, y: screenBounds.minY }, end: { x: screenBounds.maxX, y: screenBounds.maxY } },
    { start: { x: screenBounds.maxX, y: screenBounds.maxY }, end: { x: screenBounds.minX, y: screenBounds.maxY } },
    { start: { x: screenBounds.minX, y: screenBounds.maxY }, end: { x: screenBounds.minX, y: screenBounds.minY } },
  ];

  for (const segment of screenSegments) {
    const hit = intersectRaySegment(ray, segment);

    if (hit && hit.onSegment && hit.t > 0.001) {
      if (!closestHit || hit.t < closestHit.t) {
        closestHit = { point: hit.point, t: hit.t };
      }
    }
  }

  return closestHit?.point ?? null;
}

/**
 * Check if there's direct line of sight between two points.
 */
function hasDirectLineOfSight(
  from: Vector2,
  to: Vector2,
  surfaces: readonly Surface[]
): boolean {
  const ray = createRay(from, to);
  const targetDist = distance(from, to);

  for (const surface of surfaces) {
    const segment: Segment = {
      start: surface.segment.start,
      end: surface.segment.end,
    };

    const hit = intersectRaySegment(ray, segment);

    if (hit && hit.onSegment && hit.t > 0.001) {
      const hitDist = distance(from, hit.point);
      if (hitDist < targetDist - 1) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Calculate distance between two points.
 */
function distance(a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Remove duplicate points from polygon.
 */
function removeDuplicatePoints(points: Vector2[]): Vector2[] {
  const unique: Vector2[] = [];
  const threshold = 0.5;

  for (const point of points) {
    const isDuplicate = unique.some(
      (p) => Math.abs(p.x - point.x) < threshold && Math.abs(p.y - point.y) < threshold
    );

    if (!isDuplicate) {
      unique.push(point);
    }
  }

  return unique;
}

