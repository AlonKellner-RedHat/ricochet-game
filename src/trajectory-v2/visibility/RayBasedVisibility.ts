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
 * Cast a ray through a window point and find where it hits on the far side.
 * This extends the ray past the window to find surfaces/screen on the player's side.
 */
function castRayThroughWindow(
  origin: Vector2,
  windowPoint: Vector2,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds
): Vector2 | null {
  // Create a ray that goes from origin through windowPoint
  const dx = windowPoint.x - origin.x;
  const dy = windowPoint.y - origin.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  // Extend far past the window point
  const farPoint = {
    x: windowPoint.x + (dx / len) * 10000,
    y: windowPoint.y + (dy / len) * 10000,
  };

  const ray = createRay(origin, farPoint);

  // Find the first hit AFTER the window point
  let closestHit: { point: Vector2; t: number } | null = null;
  const windowT = 1.0; // Window point is at t=1 in the ray from origin to windowPoint

  // Check surfaces
  for (const surface of surfaces) {
    const segment: Segment = {
      start: surface.segment.start,
      end: surface.segment.end,
    };

    const hit = intersectRaySegment(ray, segment);

    // Hit must be past the window point (t > windowT scaled appropriately)
    // Since ray goes to farPoint, we need to check if hit.t corresponds to past windowPoint
    if (hit && hit.onSegment && hit.t > 0.001) {
      const hitDist = distance(origin, hit.point);
      const windowDist = distance(origin, windowPoint);

      if (hitDist > windowDist + 1) {
        // Hit is past the window
        if (!closestHit || hit.t < closestHit.t) {
          closestHit = { point: hit.point, t: hit.t };
        }
      }
    }
  }

  // Check screen bounds
  const screenSegments: Segment[] = [
    { start: { x: screenBounds.minX, y: screenBounds.minY }, end: { x: screenBounds.maxX, y: screenBounds.minY } },
    { start: { x: screenBounds.maxX, y: screenBounds.minY }, end: { x: screenBounds.maxX, y: screenBounds.maxY } },
    { start: { x: screenBounds.maxX, y: screenBounds.maxY }, end: { x: screenBounds.minX, y: screenBounds.maxY } },
    { start: { x: screenBounds.minX, y: screenBounds.maxY }, end: { x: screenBounds.minX, y: screenBounds.minY } },
  ];

  for (const segment of screenSegments) {
    const hit = intersectRaySegment(ray, segment);

    if (hit && hit.onSegment && hit.t > 0.001) {
      const hitDist = distance(origin, hit.point);
      const windowDist = distance(origin, windowPoint);

      if (hitDist > windowDist + 1) {
        if (!closestHit || hit.t < closestHit.t) {
          closestHit = { point: hit.point, t: hit.t };
        }
      }
    }
  }

  return closestHit?.point ?? null;
}

/**
 * Cast a ray at a specific angle, including screen bounds in the hit check.
 * This is important when the origin is off-screen.
 */
function castRayAtAngleIncludeScreen(
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

  // Include screen boundary segments as surfaces
  const screenSegments: Segment[] = [
    { start: { x: screenBounds.minX, y: screenBounds.minY }, end: { x: screenBounds.maxX, y: screenBounds.minY } },
    { start: { x: screenBounds.maxX, y: screenBounds.minY }, end: { x: screenBounds.maxX, y: screenBounds.maxY } },
    { start: { x: screenBounds.maxX, y: screenBounds.maxY }, end: { x: screenBounds.minX, y: screenBounds.maxY } },
    { start: { x: screenBounds.minX, y: screenBounds.maxY }, end: { x: screenBounds.minX, y: screenBounds.minY } },
  ];

  let closestHit: { point: Vector2; t: number } | null = null;

  // Check surfaces
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

  // Check screen bounds
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
 * Calculate visibility through planned surfaces using rays with grazing ray technique.
 *
 * Key insight: The planned surface acts as a "window". Only the region visible
 * through this window should be lit. We cast rays from the player image (reflected
 * position) and only include points that would be seen through the window.
 *
 * For off-screen player images, we still cast rays toward the window and obstacles,
 * but the polygon is built on the reflective side of the window.
 */
function calculatePlannedRayVisibility(
  player: Vector2,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds,
  plannedSurfaces: readonly Surface[]
): RayVisibilityResult {
  const epsilon = 0.0001;

  // Use ImageChain to check for bypass conditions
  // This ensures we use the same logic as isCursorLit
  // Note: We use a dummy cursor since we only need player-side checks
  const dummyCursor = player; // Will be replaced per-cursor position
  const chain = createImageChain(player, dummyCursor, plannedSurfaces);

  // Check 1: Player must be on reflective side of first planned surface
  if (!chain.isPlayerOnReflectiveSide(0)) {
    return {
      polygon: [],
      origin: player,
      rays: [],
      isValid: false,
    };
  }

  // Reflect player through all planned surfaces to get "player image"
  let playerImage = player;
  for (const surface of plannedSurfaces) {
    playerImage = reflectPointThroughLine(
      playerImage,
      surface.segment.start,
      surface.segment.end
    );
  }

  // The last planned surface acts as a "window"
  const lastSurface = plannedSurfaces[plannedSurfaces.length - 1]!;
  const windowStart = lastSurface.segment.start;
  const windowEnd = lastSurface.segment.end;

  // Filter surfaces to not include the planned surfaces (we cast through them)
  const obstacleSurfaces = surfaces.filter(
    (s) => !plannedSurfaces.some((ps) => ps.id === s.id)
  );

  // Collect ray data with angles and hit points
  const rayData: { angle: number; point: Vector2 | null }[] = [];

  // Helper to check if a point is on the reflective side of the window
  // (same side as the player, opposite side from the player image)
  // Points ON the line (cross = 0) are considered valid (they're on the window)
  const isOnReflectiveSide = (point: Vector2): boolean => {
    const cross1 = crossProduct(windowStart, windowEnd, point);
    const cross2 = crossProduct(windowStart, windowEnd, player);
    // Point is on the line (valid - it's on the window itself)
    if (Math.abs(cross1) < 0.001) return true;
    // Point is on the same side as the player
    return cross1 * cross2 > 0;
  };

  // Add window endpoints with grazing rays
  // These are always included as they define the window boundaries
  for (const endpoint of [windowStart, windowEnd]) {
    const angle = Math.atan2(endpoint.y - playerImage.y, endpoint.x - playerImage.x);

    // Ray before endpoint - cast to find where it hits obstacles or screen bounds
    // Only include if the hit is on the reflective (player's) side
    const beforeHit = castRayAtAngleIncludeScreen(playerImage, angle - epsilon, obstacleSurfaces, screenBounds);
    if (beforeHit && isOnReflectiveSide(beforeHit)) {
      rayData.push({ angle: angle - epsilon, point: beforeHit });
    }

    // Ray at endpoint - this hits the window edge itself
    // Window endpoints are always included (they're on the boundary)
    rayData.push({ angle, point: endpoint });

    // Ray after endpoint
    const afterHit = castRayAtAngleIncludeScreen(playerImage, angle + epsilon, obstacleSurfaces, screenBounds);
    if (afterHit && isOnReflectiveSide(afterHit)) {
      rayData.push({ angle: angle + epsilon, point: afterHit });
    }
  }

  // Cast rays through the window at multiple sample points
  // This ensures we capture the full visible region, including areas between obstacles
  const windowSamples = 10; // Number of sample points along the window
  for (let i = 0; i <= windowSamples; i++) {
    const t = i / windowSamples;
    const samplePoint = {
      x: windowStart.x + t * (windowEnd.x - windowStart.x),
      y: windowStart.y + t * (windowEnd.y - windowStart.y),
    };

    const angle = Math.atan2(samplePoint.y - playerImage.y, samplePoint.x - playerImage.x);

    // Cast ray THROUGH the window sample point to find where it hits on the player's side
    const throughHit = castRayThroughWindow(playerImage, samplePoint, obstacleSurfaces, screenBounds);
    if (throughHit && isOnReflectiveSide(throughHit)) {
      rayData.push({ angle, point: throughHit });
    }
  }

  // Also cast grazing rays at window endpoints for edge definition
  for (const endpoint of [windowStart, windowEnd]) {
    const angle = Math.atan2(endpoint.y - playerImage.y, endpoint.x - playerImage.x);

    // Grazing rays just inside the window
    const beforeHitThrough = castRayThroughWindow(playerImage, {
      x: endpoint.x + Math.cos(angle - epsilon) * 10,
      y: endpoint.y + Math.sin(angle - epsilon) * 10
    }, obstacleSurfaces, screenBounds);
    if (beforeHitThrough && isOnReflectiveSide(beforeHitThrough)) {
      rayData.push({ angle: angle - epsilon * 2, point: beforeHitThrough });
    }

    const afterHitThrough = castRayThroughWindow(playerImage, {
      x: endpoint.x + Math.cos(angle + epsilon) * 10,
      y: endpoint.y + Math.sin(angle + epsilon) * 10
    }, obstacleSurfaces, screenBounds);
    if (afterHitThrough && isOnReflectiveSide(afterHitThrough)) {
      rayData.push({ angle: angle + epsilon * 2, point: afterHitThrough });
    }
  }

  // Add screen corner points that are visible through the window
  // IMPORTANT: We cast rays through window to find actual hit points,
  // not just add screen corners directly (which ignores obstacles after the window)
  const screenCorners = [
    { x: screenBounds.minX, y: screenBounds.minY },
    { x: screenBounds.maxX, y: screenBounds.minY },
    { x: screenBounds.maxX, y: screenBounds.maxY },
    { x: screenBounds.minX, y: screenBounds.maxY },
  ];

  for (const corner of screenCorners) {
    if (!isOnReflectiveSide(corner)) continue;
    if (!rayPassesThroughWindow(playerImage, corner, lastSurface)) continue;

    // Cast ray through the window to find where it actually hits (respecting obstacles)
    const angle = Math.atan2(corner.y - playerImage.y, corner.x - playerImage.x);

    // Use the window midpoint as the "through" point for this direction
    const windowMid = {
      x: (windowStart.x + windowEnd.x) / 2,
      y: (windowStart.y + windowEnd.y) / 2,
    };

    // Cast ray through window and find first obstacle hit on the far side
    const throughHit = castRayThroughWindow(playerImage, windowMid, obstacleSurfaces, screenBounds);
    if (throughHit && isOnReflectiveSide(throughHit)) {
      rayData.push({ angle, point: throughHit });
    }
  }

  // Add obstacle endpoints that are visible through the window
  for (const surface of obstacleSurfaces) {
    for (const endpoint of [surface.segment.start, surface.segment.end]) {
      // Only include points on the reflective side
      if (!isOnReflectiveSide(endpoint)) continue;
      // Only include points visible through the window
      if (!rayPassesThroughWindow(playerImage, endpoint, lastSurface)) continue;

      const angle = Math.atan2(endpoint.y - playerImage.y, endpoint.x - playerImage.x);

      // Grazing rays
      const beforeHit = castRayAtAngleIncludeScreen(playerImage, angle - epsilon, obstacleSurfaces, screenBounds);
      if (beforeHit && isOnReflectiveSide(beforeHit)) {
        rayData.push({ angle: angle - epsilon, point: beforeHit });
      }

      const exactRay = createRay(playerImage, endpoint);
      const exactHit = castRayToFirstSurface(exactRay, playerImage, obstacleSurfaces, screenBounds);
      if (exactHit && isOnReflectiveSide(exactHit)) {
        rayData.push({ angle, point: exactHit });
      }

      const afterHit = castRayAtAngleIncludeScreen(playerImage, angle + epsilon, obstacleSurfaces, screenBounds);
      if (afterHit && isOnReflectiveSide(afterHit)) {
        rayData.push({ angle: angle + epsilon, point: afterHit });
      }
    }
  }

  // Add screen corners visible through the window
  const corners = [
    { x: screenBounds.minX, y: screenBounds.minY },
    { x: screenBounds.maxX, y: screenBounds.minY },
    { x: screenBounds.maxX, y: screenBounds.maxY },
    { x: screenBounds.minX, y: screenBounds.maxY },
  ];

  for (const corner of corners) {
    if (!isOnReflectiveSide(corner)) continue;
    if (!rayPassesThroughWindow(playerImage, corner, lastSurface)) continue;

    const angle = Math.atan2(corner.y - playerImage.y, corner.x - playerImage.x);
    const ray = createRay(playerImage, corner);
    const hit = castRayToFirstSurface(ray, playerImage, obstacleSurfaces, screenBounds);
    if (hit && isOnReflectiveSide(hit)) {
      rayData.push({ angle, point: hit });
    }
  }

  // Filter out null points
  const validRayData = rayData.filter((r) => r.point !== null);

  if (validRayData.length < 3) {
    return {
      polygon: [],
      origin: playerImage,
      rays: [],
      isValid: false,
    };
  }

  // Extract polygon points
  const allPoints: Vector2[] = validRayData
    .map((r) => r.point)
    .filter((p): p is Vector2 => p !== null);

  // Remove duplicate points
  const uniquePoints = removeDuplicatePoints(allPoints);

  // For off-screen player image, sort points by walking around the polygon perimeter
  // Use convex hull or centroid-based angle sorting
  const centroid = {
    x: uniquePoints.reduce((sum, p) => sum + p.x, 0) / uniquePoints.length,
    y: uniquePoints.reduce((sum, p) => sum + p.y, 0) / uniquePoints.length,
  };

  // Sort by angle from centroid (not from off-screen origin)
  const sortedPoints = [...uniquePoints].sort((a, b) => {
    const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
    const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
    return angleA - angleB;
  });

  // Create rays for debugging
  const rays: Ray[] = validRayData.map((r) => {
    const farPoint = {
      x: playerImage.x + Math.cos(r.angle) * 10000,
      y: playerImage.y + Math.sin(r.angle) * 10000,
    };
    return createRay(playerImage, farPoint);
  });

  return {
    polygon: sortedPoints,
    origin: playerImage,
    rays,
    isValid: sortedPoints.length >= 3,
  };
}

/**
 * Cross product of vectors (p1 - origin) and (p2 - origin).
 * Positive if p2 is counter-clockwise from p1.
 */
function crossProduct(origin: Vector2, p1: Vector2, p2: Vector2): number {
  return (p1.x - origin.x) * (p2.y - origin.y) - (p1.y - origin.y) * (p2.x - origin.x);
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


