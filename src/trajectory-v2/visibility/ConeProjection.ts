/**
 * ConeProjection - Core visibility polygon calculation
 *
 * Projects a cone of light through obstacles to create a visibility polygon.
 * The cone can start from a point (360°) or from a line segment (window/umbrella).
 *
 * First Principles:
 * - V.3: Light exits through the window
 * - V.5: Cursor outside polygon = invalid path
 * - V.7: Polygon vertices sorted by angle
 */

import type { Surface } from "@/surfaces/Surface";
import { lineLineIntersection } from "@/trajectory-v2/geometry/GeometryOps";
import type { Vector2, Segment } from "@/trajectory-v2/geometry/types";

// Re-export Segment for backward compatibility
export type { Segment };

// =============================================================================
// TYPES
// =============================================================================

/**
 * Screen/viewport bounds for clipping.
 */
export interface ScreenBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * Configuration for a cone of light.
 *
 * The cone is defined by:
 * - origin: Where rays converge (player position or reflected image)
 * - leftBoundary/rightBoundary: Angular extent of the cone
 * - startLine: If set, rays start from this line instead of from origin
 *
 * For a 360° cone: leftBoundary and rightBoundary are the same point
 * For a windowed cone: rays start from startLine and spread outward
 */
export interface ConeSource {
  /** Where rays converge toward (player or reflected image) */
  readonly origin: Vector2;
  /** Left edge of the cone (as seen from origin looking outward) */
  readonly leftBoundary: Vector2;
  /** Right edge of the cone (as seen from origin looking outward) */
  readonly rightBoundary: Vector2;
  /** If set, rays start from this line segment, not from origin */
  readonly startLine: Segment | null;
}

// =============================================================================
// CONE CREATION HELPERS
// =============================================================================

/**
 * Create a full 360° cone starting from a point.
 * Used for normal player visibility (no umbrella/reflection).
 */
export function createFullCone(origin: Vector2): ConeSource {
  // For a full cone, boundaries are set to a sentinel that means "all directions"
  // We use origin + (1, 0) as a dummy - the isFullCone check will detect this
  return {
    origin,
    leftBoundary: { x: origin.x + 1, y: origin.y },
    rightBoundary: { x: origin.x + 1, y: origin.y },
    startLine: null,
  };
}

/**
 * Check if a cone is a full 360° cone.
 */
export function isFullCone(cone: ConeSource): boolean {
  // Full cone has no startLine and boundaries are the same point
  return (
    cone.startLine === null &&
    cone.leftBoundary.x === cone.rightBoundary.x &&
    cone.leftBoundary.y === cone.rightBoundary.y
  );
}

/**
 * Create a cone that projects through a window (line segment).
 * Used for umbrella mode and reflections.
 *
 * DETERMINISM: startLine is ALWAYS { start: windowStart, end: windowEnd }
 * regardless of the cross product result. This ensures consistent behavior
 * and eliminates floating-point discrepancies from segment direction.
 *
 * @param origin - Where rays converge (player or reflected image)
 * @param windowStart - One end of the window
 * @param windowEnd - Other end of the window
 */
export function createConeThroughWindow(
  origin: Vector2,
  windowStart: Vector2,
  windowEnd: Vector2
): ConeSource {
  // Determine which endpoint is "left" and which is "right" using cross product
  // Left = counter-clockwise from right as seen from origin
  const cross = crossProduct(origin, windowStart, windowEnd);

  // DETERMINISM: startLine always uses windowStart -> windowEnd order
  // This matches the order the surface is defined in, eliminating
  // floating-point discrepancies from reversed segment calculations
  const startLine: Segment = { start: windowStart, end: windowEnd };

  if (cross >= 0) {
    // windowEnd is to the left of windowStart
    return {
      origin,
      leftBoundary: windowEnd,
      rightBoundary: windowStart,
      startLine,
    };
  }

  // windowStart is to the left of windowEnd
  return {
    origin,
    leftBoundary: windowStart,
    rightBoundary: windowEnd,
    startLine,
  };
}

// =============================================================================
// GEOMETRY HELPERS
// =============================================================================

/**
 * Cross product of vectors (origin→a) and (origin→b).
 * Positive = b is counter-clockwise (left) of a
 * Negative = b is clockwise (right) of a
 * Zero = collinear
 */
function crossProduct(origin: Vector2, a: Vector2, b: Vector2): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

/**
 * Check if a point is within the angular sector of a cone.
 * For full cones, always returns true.
 */
export function isPointInCone(point: Vector2, cone: ConeSource): boolean {
  if (isFullCone(cone)) {
    return true;
  }

  const origin = cone.origin;
  const left = cone.leftBoundary;
  const right = cone.rightBoundary;

  // Point must be:
  // - LEFT of right boundary (or on it)
  // - RIGHT of left boundary (or on it)

  const rightCross = crossProduct(origin, right, point);
  const leftCross = crossProduct(origin, left, point);

  // For a cone from right to left (counter-clockwise):
  // - rightCross >= 0 means point is left of (or on) right boundary
  // - leftCross <= 0 means point is right of (or on) left boundary

  // Check if cone spans more than 180°
  const sectorCross = crossProduct(origin, right, left);

  if (sectorCross >= 0) {
    // Cone is less than 180° - point must satisfy both conditions
    return rightCross >= 0 && leftCross <= 0;
  }

  // Cone is more than 180° - point is inside if NOT in the excluded region
  return rightCross >= 0 || leftCross <= 0;
}

/**
 * Cast a ray from origin toward target and find the first obstacle hit.
 * Returns the hit point, or null if no hit.
 */
function castRay(
  origin: Vector2,
  target: Vector2,
  obstacles: readonly Surface[],
  bounds: ScreenBounds,
  startLine: Segment | null
): Vector2 | null {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return null;

  // Extend ray far beyond target
  const scale = 10;
  const rayEnd = {
    x: origin.x + dx * scale,
    y: origin.y + dy * scale,
  };

  // Determine minimum t (where the ray starts)
  let minT = 0;

  if (startLine) {
    // Ray starts from the startLine, not from origin
    // Find where the ray intersects the startLine
    const lineHit = lineLineIntersection(origin, rayEnd, startLine.start, startLine.end);
    if (lineHit.valid && lineHit.s >= 0 && lineHit.s <= 1 && lineHit.t > 0) {
      minT = lineHit.t;
    } else {
      // Ray doesn't pass through startLine - no valid path
      return null;
    }
  }

  let closestT = Number.POSITIVE_INFINITY;
  let closestPoint: Vector2 | null = null;

  // Check obstacles
  for (const obstacle of obstacles) {
    const hit = lineLineIntersection(origin, rayEnd, obstacle.segment.start, obstacle.segment.end);

    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      closestT = hit.t;
      closestPoint = hit.point;
    }
  }

  // Check screen boundaries
  const screenEdges: Segment[] = [
    { start: { x: bounds.minX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.minY } },
    { start: { x: bounds.maxX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.maxY } },
    { start: { x: bounds.maxX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.maxY } },
    { start: { x: bounds.minX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.minY } },
  ];

  for (const edge of screenEdges) {
    const hit = lineLineIntersection(origin, rayEnd, edge.start, edge.end);

    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      closestT = hit.t;
      closestPoint = hit.point;
    }
  }

  return closestPoint;
}

/**
 * Cast a ray with continuation - used for shadow boundary detection.
 *
 * When a ray passes through a surface endpoint:
 * 1. The endpoint itself is returned (if visible)
 * 2. A continuation hit is also returned (what's beyond the endpoint)
 *
 * This replaces the epsilon-based "grazing rays" approach.
 *
 * First Principle: The shadow boundary at an endpoint creates a visibility
 * transition. We need to capture both the endpoint AND what's beyond it.
 */
function castRayWithContinuation(
  origin: Vector2,
  target: Vector2,
  obstacles: readonly Surface[],
  bounds: ScreenBounds,
  startLine: Segment | null
): Vector2[] {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [];

  // Extend ray far beyond target
  const scale = 10;
  const rayEnd = {
    x: origin.x + dx * scale,
    y: origin.y + dy * scale,
  };

  // Determine minimum t (where the ray starts)
  let minT = 0;

  if (startLine) {
    const lineHit = lineLineIntersection(origin, rayEnd, startLine.start, startLine.end);
    if (lineHit.valid && lineHit.s >= 0 && lineHit.s <= 1 && lineHit.t > 0) {
      minT = lineHit.t;
    } else {
      return [];
    }
  }

  // Collect ALL hits along the ray (not just the closest)
  const allHits: { t: number; point: Vector2; isEndpoint: boolean }[] = [];

  // Check obstacles
  for (const obstacle of obstacles) {
    const hit = lineLineIntersection(origin, rayEnd, obstacle.segment.start, obstacle.segment.end);

    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1) {
      // Check if this hit is at an endpoint (s = 0 or s = 1)
      const isEndpoint = hit.s === 0 || hit.s === 1;
      allHits.push({ t: hit.t, point: hit.point, isEndpoint });
    }
  }

  // Check screen boundaries
  const screenEdges: Segment[] = [
    { start: { x: bounds.minX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.minY } },
    { start: { x: bounds.maxX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.maxY } },
    { start: { x: bounds.maxX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.maxY } },
    { start: { x: bounds.minX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.minY } },
  ];

  for (const edge of screenEdges) {
    const hit = lineLineIntersection(origin, rayEnd, edge.start, edge.end);
    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1) {
      allHits.push({ t: hit.t, point: hit.point, isEndpoint: false });
    }
  }

  if (allHits.length === 0) return [];

  // Sort by t (distance along ray)
  allHits.sort((a, b) => a.t - b.t);

  // Get the closest hit
  const closestHit = allHits[0]!;
  const result: Vector2[] = [closestHit.point];

  // If the closest hit is at an endpoint, also get the continuation hit
  // (what's behind the endpoint on this ray)
  if (closestHit.isEndpoint && allHits.length > 1) {
    // Find the next hit that's PAST the endpoint
    // We look for hits that are further along the ray
    for (let i = 1; i < allHits.length; i++) {
      const nextHit = allHits[i]!;
      // Only add if it's significantly further (not the same point)
      if (nextHit.t > closestHit.t) {
        result.push(nextHit.point);
        break;
      }
    }
  }

  return result;
}

// =============================================================================
// MAIN ALGORITHM
// =============================================================================

/**
 * Project a cone through obstacles to create a visibility polygon.
 *
 * Algorithm:
 * 1. Collect all critical points (obstacle endpoints, screen corners)
 * 2. Cast rays to each critical point (no grazing rays - exact hits only)
 * 3. Collect all hit points
 * 4. Sort by angle from origin
 *
 * For windowed cones, the polygon is bounded by window edges.
 *
 * @param source - The cone configuration
 * @param obstacles - All surfaces that can block light
 * @param bounds - Screen boundaries
 * @param excludeSurfaceId - Optional: ID of surface to exclude from obstacles
 *                           (used to prevent window surface from blocking itself)
 */
export function projectCone(
  source: ConeSource,
  obstacles: readonly Surface[],
  bounds: ScreenBounds,
  excludeSurfaceId?: string
): Vector2[] {
  const { origin, startLine } = source;
  const isWindowed = startLine !== null;
  const vertices: Vector2[] = [];

  // Filter out excluded surface (window surface when projecting through it)
  // This prevents floating-point issues where the window blocks itself
  const effectiveObstacles = excludeSurfaceId
    ? obstacles.filter((o) => o.id !== excludeSurfaceId)
    : obstacles;

  // For windowed cones, add window endpoints directly to the polygon
  // These form the "base" of the visible region
  if (isWindowed) {
    vertices.push({ ...startLine.start });
    vertices.push({ ...startLine.end });
  }

  // Collect critical points from ALL obstacles (including excluded)
  // We still want to cast rays to window endpoints for proper polygon shape
  const criticalPoints: Vector2[] = [];

  // Add obstacle endpoints
  for (const obstacle of obstacles) {
    criticalPoints.push(obstacle.segment.start);
    criticalPoints.push(obstacle.segment.end);
  }

  // Add screen corners
  criticalPoints.push({ x: bounds.minX, y: bounds.minY });
  criticalPoints.push({ x: bounds.maxX, y: bounds.minY });
  criticalPoints.push({ x: bounds.maxX, y: bounds.maxY });
  criticalPoints.push({ x: bounds.minX, y: bounds.maxY });

  // Cast rays to each critical point within the cone
  // Uses continuation logic to capture shadow boundaries at endpoints
  for (const target of criticalPoints) {
    // Skip points at origin
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    if (dx === 0 && dy === 0) continue;

    // Check if target is in cone
    if (!isPointInCone(target, source)) continue;

    // Cast ray with continuation to capture shadow boundaries
    // This returns multiple points if the ray hits an endpoint and continues
    const hits = castRayWithContinuation(origin, target, effectiveObstacles, bounds, startLine);
    for (const hit of hits) {
      vertices.push(hit);
    }
  }

  // For windowed cones, cast rays to the cone boundaries (through window edges)
  if (!isFullCone(source)) {
    const leftHit = castRay(origin, source.leftBoundary, effectiveObstacles, bounds, startLine);
    if (leftHit) vertices.push(leftHit);

    const rightHit = castRay(origin, source.rightBoundary, effectiveObstacles, bounds, startLine);
    if (rightHit) vertices.push(rightHit);
  }

  // Remove exact duplicate points
  const uniqueVertices = removeDuplicates(vertices);

  // Sort using unified algorithm (handles both 360° and windowed cones)
  return sortPolygonVertices(uniqueVertices, origin, startLine);
}

/**
 * Remove exact duplicate points.
 */
function removeDuplicates(points: Vector2[]): Vector2[] {
  const result: Vector2[] = [];

  for (const p of points) {
    let isDuplicate = false;
    for (const existing of result) {
      if (p.x === existing.x && p.y === existing.y) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      result.push(p);
    }
  }

  return result;
}

/**
 * Sort polygon vertices in radially clockwise order.
 *
 * Unified algorithm for both full (360°) and windowed cones:
 * 1. Start with the LEFT edge (window endpoint or origin for 360°)
 * 2. Add all points in radially clockwise order (ascending angle from origin)
 * 3. End with the RIGHT edge (window endpoint or origin for 360°)
 *
 * For 360° cones: left and right edges are both the origin itself.
 * For windowed cones: left and right edges are the window endpoints.
 *
 * No epsilons or tolerances - uses exact coordinates.
 */
function sortPolygonVertices(
  points: Vector2[],
  origin: Vector2,
  startLine: Segment | null
): Vector2[] {
  if (points.length === 0) return [];

  // Determine left and right edges
  let leftEdge: Vector2;
  let rightEdge: Vector2;

  if (startLine === null) {
    // Full 360° cone: edges are the origin
    leftEdge = origin;
    rightEdge = origin;
  } else {
    // Windowed cone: edges are window endpoints
    // Left = smaller angle, Right = larger angle
    const startAngle = Math.atan2(startLine.start.y - origin.y, startLine.start.x - origin.x);
    const endAngle = Math.atan2(startLine.end.y - origin.y, startLine.end.x - origin.x);

    if (startAngle < endAngle) {
      leftEdge = startLine.start;
      rightEdge = startLine.end;
    } else {
      leftEdge = startLine.end;
      rightEdge = startLine.start;
    }
  }

  // Collect all non-edge points with their angles
  const middlePoints: { point: Vector2; angle: number }[] = [];

  for (const p of points) {
    // Skip if this is an edge point (exact match)
    if (
      (p.x === leftEdge.x && p.y === leftEdge.y) ||
      (p.x === rightEdge.x && p.y === rightEdge.y)
    ) {
      continue;
    }

    const angle = Math.atan2(p.y - origin.y, p.x - origin.x);
    middlePoints.push({ point: p, angle });
  }

  // Sort by angle ascending (clockwise traversal)
  middlePoints.sort((a, b) => a.angle - b.angle);

  // Build result: left edge → middle points → right edge
  const result: Vector2[] = [];

  // Add left edge (skip for 360° cone to avoid duplicate origin)
  if (startLine !== null) {
    result.push(leftEdge);
  }

  // Add middle points
  for (const mp of middlePoints) {
    result.push(mp.point);
  }

  // Add right edge (skip for 360° cone to avoid duplicate origin)
  if (startLine !== null) {
    result.push(rightEdge);
  }

  return result;
}
