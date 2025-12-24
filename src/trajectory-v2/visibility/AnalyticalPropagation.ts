/**
 * AnalyticalPropagation - Unified Visibility Polygon Construction
 *
 * This module implements the core visibility algorithm using analytical
 * ray casting. The same `buildVisibilityPolygon` function is used for:
 * - Empty plan (direct visibility)
 * - Before first surface (same as empty plan)
 * - After last surface (from reflected origin)
 * - Intermediate steps (before cropping by window)
 *
 * Key Design Principles:
 * 1. Use rays (source + target points), NOT angles
 * 2. All calculations are exact - no normalization
 * 3. Polygon intersection for window cropping
 * 4. Deterministic results for identical inputs
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import {
  createRay,
  intersectRaySegment,
  type Ray,
  type Segment,
} from "@/trajectory-v2/geometry/RayCore";
import type {
  PropagationStep,
  PropagationResult,
  VisibilityWindow,
} from "./PropagationTypes";

export { type ScreenBounds } from "./PropagationTypes";

/**
 * Build visibility polygon from an origin point.
 *
 * This is the unified function used at every step of propagation:
 * - For empty plan: origin = player
 * - For step K > 0: origin = player image after K-1 reflections
 *
 * Algorithm:
 * 1. Collect all critical points (obstacle endpoints + screen corners)
 * 2. For each critical point, cast a ray from origin
 * 3. Find where ray hits first obstacle or screen edge
 * 4. Cast "grazing rays" slightly past each endpoint to catch shadows
 * 5. Sort hit points angularly and build polygon
 *
 * @param origin The viewpoint (player or reflected image)
 * @param obstacles All surfaces that block visibility
 * @param bounds Screen boundaries
 * @returns Polygon vertices in angular order
 */
export function buildVisibilityPolygon(
  origin: Vector2,
  obstacles: readonly Surface[],
  bounds: ScreenBounds
): Vector2[] {
  // Collect all critical points
  const criticalPoints: Vector2[] = [];

  // Add obstacle endpoints
  for (const obstacle of obstacles) {
    criticalPoints.push(obstacle.segment.start);
    criticalPoints.push(obstacle.segment.end);
  }

  // Add screen corners
  criticalPoints.push({ x: bounds.minX, y: bounds.minY }); // Top-left
  criticalPoints.push({ x: bounds.maxX, y: bounds.minY }); // Top-right
  criticalPoints.push({ x: bounds.maxX, y: bounds.maxY }); // Bottom-right
  criticalPoints.push({ x: bounds.minX, y: bounds.maxY }); // Bottom-left

  // For each critical point, cast rays
  const hits: Array<{ point: Vector2; angle: number }> = [];

  for (const target of criticalPoints) {
    // Skip if target is at origin
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) continue;

    // Cast ray directly at target
    const directHit = castRayToFirstHit(origin, target, obstacles, bounds);
    if (directHit) {
      const angle = Math.atan2(dy, dx);
      hits.push({ point: directHit, angle });
    }

    // Cast grazing rays slightly to either side
    const epsilon = 0.0001;
    const len = Math.sqrt(dx * dx + dy * dy);
    const perpX = (-dy / len) * epsilon;
    const perpY = (dx / len) * epsilon;

    const targetLeft = { x: target.x + perpX, y: target.y + perpY };
    const targetRight = { x: target.x - perpX, y: target.y - perpY };

    const leftHit = castRayToFirstHit(origin, targetLeft, obstacles, bounds);
    if (leftHit) {
      const ldx = targetLeft.x - origin.x;
      const ldy = targetLeft.y - origin.y;
      hits.push({ point: leftHit, angle: Math.atan2(ldy, ldx) });
    }

    const rightHit = castRayToFirstHit(origin, targetRight, obstacles, bounds);
    if (rightHit) {
      const rdx = targetRight.x - origin.x;
      const rdy = targetRight.y - origin.y;
      hits.push({ point: rightHit, angle: Math.atan2(rdy, rdx) });
    }
  }

  // Sort by angle
  hits.sort((a, b) => a.angle - b.angle);

  // Remove duplicate points (within epsilon)
  const polygon: Vector2[] = [];
  const posEpsilon = 0.5;

  for (const hit of hits) {
    const isDuplicate = polygon.some(
      (p) =>
        Math.abs(p.x - hit.point.x) < posEpsilon &&
        Math.abs(p.y - hit.point.y) < posEpsilon
    );

    if (!isDuplicate) {
      polygon.push(hit.point);
    }
  }

  return polygon;
}

/**
 * Cast a ray from origin toward target and find first hit.
 * Returns the hit point, or null if ray doesn't hit anything.
 */
function castRayToFirstHit(
  origin: Vector2,
  target: Vector2,
  obstacles: readonly Surface[],
  bounds: ScreenBounds
): Vector2 | null {
  const ray = createRay(origin, target);

  let closestT = Infinity;
  let closestPoint: Vector2 | null = null;

  // Check all obstacles
  for (const obstacle of obstacles) {
    const segment: Segment = {
      start: obstacle.segment.start,
      end: obstacle.segment.end,
    };

    const hit = intersectRaySegment(ray, segment);
    if (hit && hit.onSegment && hit.t > 0.001 && hit.t < closestT) {
      closestT = hit.t;
      closestPoint = hit.point;
    }
  }

  // If no obstacle hit, find screen boundary hit
  if (!closestPoint) {
    closestPoint = findScreenBoundaryHit(ray, bounds);
  } else {
    // Check if there's a screen boundary closer than the obstacle
    const screenHit = findScreenBoundaryHit(ray, bounds);
    if (screenHit) {
      const screenDx = screenHit.x - origin.x;
      const screenDy = screenHit.y - origin.y;
      const screenDistSq = screenDx * screenDx + screenDy * screenDy;

      const obstacleDx = closestPoint.x - origin.x;
      const obstacleDy = closestPoint.y - origin.y;
      const obstacleDistSq = obstacleDx * obstacleDx + obstacleDy * obstacleDy;

      if (screenDistSq < obstacleDistSq) {
        closestPoint = screenHit;
      }
    }
  }

  return closestPoint;
}

/**
 * Find where a ray hits the screen boundary.
 */
function findScreenBoundaryHit(ray: Ray, bounds: ScreenBounds): Vector2 | null {
  const edges: Segment[] = [
    { start: { x: bounds.minX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.minY } }, // Top
    { start: { x: bounds.maxX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.maxY } }, // Right
    { start: { x: bounds.maxX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.maxY } }, // Bottom
    { start: { x: bounds.minX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.minY } }, // Left
  ];

  let closestT = Infinity;
  let closestPoint: Vector2 | null = null;

  for (const edge of edges) {
    const hit = intersectRaySegment(ray, edge);
    if (hit && hit.onSegment && hit.t > 0.001 && hit.t < closestT) {
      closestT = hit.t;
      closestPoint = hit.point;
    }
  }

  return closestPoint;
}

/**
 * Crop a visibility polygon by a window triangle.
 *
 * The window is defined by:
 * 1. Ray from origin through surface.start
 * 2. Ray from origin through surface.end
 * 3. The surface segment itself
 *
 * This is a polygon intersection (Sutherland-Hodgman algorithm).
 *
 * @param polygon The polygon to crop
 * @param origin The window origin
 * @param windowSurface The surface forming the window
 * @returns Cropped polygon vertices
 */
export function cropPolygonByWindow(
  polygon: readonly Vector2[],
  origin: Vector2,
  windowSurface: Surface
): Vector2[] {
  if (polygon.length < 3) return [];

  const surfStart = windowSurface.segment.start;
  const surfEnd = windowSurface.segment.end;

  // Build the window triangle edges as clipping planes
  // The triangle is: origin -> surfStart -> surfEnd -> origin
  // We clip against each edge, keeping points on the "inside"

  // Edge 1: origin -> surfStart (keep points on right side looking from origin to surfStart)
  let clipped = clipPolygonByEdge(polygon, origin, surfStart);
  if (clipped.length < 3) return [];

  // Edge 2: surfStart -> surfEnd (the surface itself - keep points on origin's side)
  clipped = clipPolygonByEdge(clipped, surfStart, surfEnd);
  if (clipped.length < 3) return [];

  // Edge 3: surfEnd -> origin (keep points on right side looking from surfEnd to origin)
  clipped = clipPolygonByEdge(clipped, surfEnd, origin);

  return clipped;
}

/**
 * Clip polygon by a half-plane defined by an edge.
 * Sutherland-Hodgman single-edge clipping step.
 */
function clipPolygonByEdge(
  polygon: readonly Vector2[],
  edgeStart: Vector2,
  edgeEnd: Vector2
): Vector2[] {
  if (polygon.length === 0) return [];

  const result: Vector2[] = [];

  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i]!;
    const next = polygon[(i + 1) % polygon.length]!;

    const currentInside = isOnRightSide(current, edgeStart, edgeEnd);
    const nextInside = isOnRightSide(next, edgeStart, edgeEnd);

    if (currentInside) {
      result.push(current);

      if (!nextInside) {
        // Current inside, next outside: add intersection
        const intersection = lineIntersection(
          edgeStart,
          edgeEnd,
          current,
          next
        );
        if (intersection) {
          result.push(intersection);
        }
      }
    } else if (nextInside) {
      // Current outside, next inside: add intersection
      const intersection = lineIntersection(edgeStart, edgeEnd, current, next);
      if (intersection) {
        result.push(intersection);
      }
    }
  }

  return result;
}

/**
 * Check if a point is on the right side of an edge (or on the edge).
 * "Right side" is determined by the cross product sign.
 */
function isOnRightSide(
  point: Vector2,
  edgeStart: Vector2,
  edgeEnd: Vector2
): boolean {
  // Cross product: (edge × point_relative)
  // Positive = right side, negative = left side
  const cross =
    (edgeEnd.x - edgeStart.x) * (point.y - edgeStart.y) -
    (edgeEnd.y - edgeStart.y) * (point.x - edgeStart.x);

  // Include points exactly on the edge (cross = 0)
  return cross >= -0.001;
}

/**
 * Find intersection of two line segments.
 */
function lineIntersection(
  p1: Vector2,
  p2: Vector2,
  p3: Vector2,
  p4: Vector2
): Vector2 | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) {
    return null; // Parallel lines
  }

  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;

  return {
    x: p1.x + t * d1x,
    y: p1.y + t * d1y,
  };
}

// Re-export ScreenBounds for convenience
export interface ScreenBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Propagate visibility through planned surfaces, building intermediate polygons.
 *
 * This is the main entry point for visibility calculation with planned surfaces.
 * It produces a PropagationResult with N+1 steps for N planned surfaces.
 *
 * The algorithm:
 * 1. Step 0: Full visibility from player (same code as empty plan)
 * 2. For each planned surface:
 *    a. Check if player is on reflective side (bypass detection)
 *    b. Build full visibility from current origin (SAME buildVisibilityPolygon function)
 *    c. Crop by window triangle
 *    d. Reflect origin for next step
 * 3. Return all intermediate polygons
 *
 * @param player The player position
 * @param plannedSurfaces Surfaces in the plan (order matters)
 * @param allSurfaces All surfaces in the scene (for obstruction)
 * @param bounds Screen boundaries
 * @returns PropagationResult with all intermediate steps
 */
export function propagateWithIntermediates(
  player: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[],
  bounds: ScreenBounds
): PropagationResult {
  const steps: PropagationStep[] = [];
  let currentOrigin = player;

  // Step 0: Full visibility from player (same code as empty plan)
  const step0Polygon = buildVisibilityPolygon(currentOrigin, allSurfaces, bounds);
  steps.push({
    index: 0,
    origin: { ...currentOrigin },
    polygon: step0Polygon,
    isValid: step0Polygon.length >= 3,
    window: undefined,
  });

  // If no planned surfaces, we're done
  if (plannedSurfaces.length === 0) {
    return {
      steps,
      finalPolygon: step0Polygon,
      isValid: step0Polygon.length >= 3,
      playerPosition: player,
      finalOrigin: currentOrigin,
    };
  }

  // For each planned surface
  for (let i = 0; i < plannedSurfaces.length; i++) {
    const surface = plannedSurfaces[i]!;

    // Check bypass: player (or current origin) must be on reflective side
    if (!isOnReflectiveSide(currentOrigin, surface)) {
      // Bypass detected - return invalid result
      return {
        steps,
        finalPolygon: [],
        isValid: false,
        bypassAtSurface: i,
        playerPosition: player,
        finalOrigin: currentOrigin,
      };
    }

    // Build window for cropping
    const window: VisibilityWindow = {
      leftRay: createRay(currentOrigin, surface.segment.start),
      rightRay: createRay(currentOrigin, surface.segment.end),
      surface,
      origin: { ...currentOrigin },
    };

    // Build full polygon from current origin, excluding the planned surface
    // (we're looking THROUGH it, not AT it)
    const obstaclesExcludingSurface = allSurfaces.filter(s => s.id !== surface.id);
    const fullPolygon = buildVisibilityPolygon(
      currentOrigin,
      obstaclesExcludingSurface,
      bounds
    );

    // Crop by window
    const croppedPolygon = cropPolygonByWindow(fullPolygon, currentOrigin, surface);

    // Reflect origin for next step
    currentOrigin = reflectPoint(currentOrigin, surface);

    steps.push({
      index: i + 1,
      origin: { ...currentOrigin },
      polygon: croppedPolygon,
      isValid: croppedPolygon.length >= 3,
      window,
    });
  }

  const finalPolygon = steps[steps.length - 1]!.polygon;

  return {
    steps,
    finalPolygon,
    isValid: finalPolygon.length >= 3,
    playerPosition: player,
    finalOrigin: currentOrigin,
  };
}

/**
 * Check if a point is on the reflective side of a surface.
 */
function isOnReflectiveSide(point: Vector2, surface: Surface): boolean {
  // Use the surface's built-in method if available
  if (surface.isOnReflectiveSide) {
    return surface.isOnReflectiveSide(point);
  }

  // Fallback: check using cross product
  const { start, end } = surface.segment;
  const cross =
    (end.x - start.x) * (point.y - start.y) -
    (end.y - start.y) * (point.x - start.x);

  // Assume "reflective side" is the positive side (cross >= 0)
  return cross >= 0;
}

/**
 * Reflect a point through a surface line.
 */
function reflectPoint(point: Vector2, surface: Surface): Vector2 {
  const { start, end } = surface.segment;

  // Line direction
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-10) {
    return point; // Degenerate surface
  }

  // Vector from start to point
  const px = point.x - start.x;
  const py = point.y - start.y;

  // Project point onto line
  const t = (px * dx + py * dy) / lenSq;

  // Closest point on line
  const closestX = start.x + t * dx;
  const closestY = start.y + t * dy;

  // Reflect: point' = 2 * closest - point
  return {
    x: 2 * closestX - point.x,
    y: 2 * closestY - point.y,
  };
}

