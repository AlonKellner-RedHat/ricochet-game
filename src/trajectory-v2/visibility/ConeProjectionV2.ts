/**
 * ConeProjection V2 - Source-of-Truth Based Visibility Polygon
 *
 * Projects a cone of light through obstacles to create a visibility polygon.
 * Uses SourcePoint types for exact floating-point matching without epsilons.
 *
 * Key Improvements over V1:
 * - No epsilon comparisons - uses SourcePoint type checks
 * - Screen boundaries as surfaces - unified obstacle handling
 * - Endpoint detection via type, not s ≈ 0/1 check
 * - Continuation detection via equals(), not t + epsilon
 *
 * First Principles:
 * - V.3: Light exits through the window
 * - V.5: Cursor outside polygon = invalid path
 * - V.7: Polygon vertices sorted by angle
 */

import type { Surface } from "@/surfaces/Surface";
import { lineLineIntersection } from "@/trajectory-v2/geometry/GeometryOps";
import {
  type ScreenBoundaries,
  type ScreenBoundsConfig,
  createScreenBoundaries,
  createScreenBoundaryChain,
} from "@/trajectory-v2/geometry/ScreenBoundaries";
import {
  type Endpoint,
  HitPoint,
  OriginPoint,
  type SourcePoint,
  endOf,
  isEndpoint,
  isHitPoint,
  isOriginPoint,
  startOf,
} from "@/trajectory-v2/geometry/SourcePoint";
import {
  type JunctionPoint,
  type SurfaceChain,
  isJunctionPoint,
} from "@/trajectory-v2/geometry/SurfaceChain";
import type { Ray, Vector2 } from "@/trajectory-v2/geometry/types";

// =============================================================================
// TYPES
// =============================================================================

/**
 * A line segment defined by two endpoints.
 */
export interface Segment {
  readonly start: Vector2;
  readonly end: Vector2;
}

/**
 * Configuration for a cone of light.
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

/**
 * Pre-computed orientation of a surface relative to the cone origin.
 *
 * This is the SINGLE SOURCE OF TRUTH for all decisions about a surface:
 * - Ray ordering: Which endpoint comes first in CCW traversal
 * - Classification: Which endpoint is "entering" vs "exiting"
 * - Shadow boundary: Whether continuation comes before or after endpoint
 *
 * Using one calculation for all decisions eliminates floating-point
 * inconsistencies that occur when atan2 and cross product disagree.
 */
export interface SurfaceOrientation {
  /** The surface this orientation applies to */
  readonly surface: Surface;
  /** Which endpoint comes first in CCW traversal around origin */
  readonly firstEndpoint: "start" | "end";
  /** The raw cross product value (for degenerate case handling) */
  readonly crossProduct: number;
}

/**
 * Compute the orientation of a surface relative to the cone origin.
 *
 * Uses cross product to determine which endpoint comes first in CCW traversal.
 * This single calculation drives all subsequent decisions about the surface.
 *
 * @param surface The surface to compute orientation for
 * @param origin The cone origin (player position)
 * @returns The computed orientation
 */
export function computeSurfaceOrientation(surface: Surface, origin: Vector2): SurfaceOrientation {
  const start = surface.segment.start;
  const end = surface.segment.end;

  // Cross product: (origin→start) × (origin→end)
  // Positive: start is CCW from end → start comes first
  // Negative: end is CCW from start → end comes first
  // Zero: collinear (degenerate) → use start as convention
  const startVec = { x: start.x - origin.x, y: start.y - origin.y };
  const endVec = { x: end.x - origin.x, y: end.y - origin.y };
  const cross = startVec.x * endVec.y - startVec.y * endVec.x;

  return {
    surface,
    firstEndpoint: cross >= 0 ? "start" : "end",
    crossProduct: cross,
  };
}

/**
 * Determine shadow boundary order from pre-computed orientation.
 *
 * Invariants (derived from first principles):
 * - First endpoint (in CCW) is ENTERING the surface (coming from shadow)
 *   → continuation should come BEFORE endpoint → return positive
 * - Second endpoint (in CCW) is EXITING the surface (going to shadow)
 *   → endpoint should come BEFORE continuation → return negative
 *
 * @param endpoint The endpoint to determine order for
 * @param orientation The pre-computed surface orientation
 * @returns Positive if continuation first, negative if endpoint first
 */
export function getShadowBoundaryOrderFromOrientation(
  endpoint: Endpoint,
  orientation: SurfaceOrientation
): number {
  const isFirst = endpoint.which === orientation.firstEndpoint;
  // First = entering = continuation before endpoint → positive
  // Second = exiting = endpoint before continuation → negative
  return isFirst ? 1 : -1;
}

// =============================================================================
// UNIFIED CROSS-PRODUCT COMPARATOR
// =============================================================================

/**
 * Point with precomputed data for sorting.
 */
interface SortablePoint {
  point: SourcePoint;
  xy: Vector2;
  pairedEndpoint: Endpoint | JunctionPoint | null;
}

/**
 * Compare two points for CCW polygon sorting using ray-crossing reversal.
 *
 * ALGORITHM:
 * 1. Use the standard cross-product comparison
 * 2. Check if the points are on opposite sides of the reference ray
 * 3. If they are, the comparison "crosses" the ray - use reference position to determine order
 *
 * This is EPSILON-FREE and uses only cross-product calculations.
 */
function comparePointsCCW(
  a: SortablePoint,
  b: SortablePoint,
  origin: Vector2,
  refDirection: Vector2,
  surfaceOrientations: Map<string, SurfaceOrientation>,
  continuationToEndpoint: Map<string, Endpoint | JunctionPoint>,
  endpointToContinuation: Map<string, SourcePoint>
): number {
  // Get effective coordinates for comparison
  // For continuations, use their paired endpoint's coordinates to maintain transitivity
  const aXY = a.pairedEndpoint ? a.pairedEndpoint.computeXY() : a.xy;
  const bXY = b.pairedEndpoint ? b.pairedEndpoint.computeXY() : b.xy;

  // Compute vectors from origin
  const aVec = { x: aXY.x - origin.x, y: aXY.y - origin.y };
  const bVec = { x: bXY.x - origin.x, y: bXY.y - origin.y };

  // Cross with reference direction: determines which side of the ray each point is on
  const aRef = refDirection.x * aVec.y - refDirection.y * aVec.x;
  const bRef = refDirection.x * bVec.y - refDirection.y * bVec.x;

  // Handle points on or very close to the reference ray.
  // Use PROVENANCE to determine if points are on the same ray:
  // - If two points share the same pairedEndpoint, they're on the same ray
  // - If a point IS a pairedEndpoint and its continuation is the other, they're on the same ray
  const aMagSq = aVec.x * aVec.x + aVec.y * aVec.y;
  const bMagSq = bVec.x * bVec.x + bVec.y * bVec.y;

  // Check if points are on the same ray via provenance (not recalculation)
  const aKey = a.point.getKey();
  const bKey = b.point.getKey();
  const aPairedEndpoint = continuationToEndpoint.get(aKey);
  const bPairedEndpoint = continuationToEndpoint.get(bKey);
  const aContinuation = endpointToContinuation.get(aKey);
  const bContinuation = endpointToContinuation.get(bKey);

  // Points are on same ray if:
  // 1. a is continuation of b (or vice versa)
  // 2. Both are continuations of the same endpoint
  const sameRay =
    (aPairedEndpoint && aPairedEndpoint.getKey() === bKey) ||
    (bPairedEndpoint && bPairedEndpoint.getKey() === aKey) ||
    (aContinuation && aContinuation.getKey() === bKey) ||
    (bContinuation && bContinuation.getKey() === aKey) ||
    (aPairedEndpoint && bPairedEndpoint && aPairedEndpoint.getKey() === bPairedEndpoint.getKey());

  // If points are on the same ray (via provenance), sort by distance
  if (sameRay) {
    if (aMagSq !== bMagSq) {
      return aMagSq - bMagSq;
    }
    // Same distance - use shadow boundary ordering
    return handleCollinearPoints(
      a,
      b,
      origin,
      surfaceOrientations,
      continuationToEndpoint,
      endpointToContinuation
    );
  }

  // Check if points are on opposite sides of the reference ray
  const oppositeSides = (aRef > 0 && bRef < 0) || (aRef < 0 && bRef > 0);

  if (oppositeSides) {
    return aRef > 0 ? -1 : 1;
  }

  // Same side: cross-product is transitive
  const cross = aVec.x * bVec.y - aVec.y * bVec.x;

  if (cross > 0) {
    return -1;
  }

  if (cross < 0) {
    return 1;
  }

  // Collinear (cross === 0): Use tiebreakers
  return handleCollinearPoints(
    a,
    b,
    origin,
    surfaceOrientations,
    continuationToEndpoint,
    endpointToContinuation
  );
}

/**
 * Handle collinear points (cross product = 0) with appropriate tiebreakers.
 *
 * Priority:
 * 1. Same-surface endpoint comparison: Use SurfaceOrientation
 * 2. Endpoint + its paired continuation: Use shadow boundary order
 * 3. Different surfaces with same angle: Distance from origin (closer first)
 */
function handleCollinearPoints(
  a: SortablePoint,
  b: SortablePoint,
  origin: Vector2,
  surfaceOrientations: Map<string, SurfaceOrientation>,
  continuationToEndpoint: Map<string, Endpoint | JunctionPoint>,
  endpointToContinuation: Map<string, SourcePoint>
): number {
  const p1 = a.point;
  const p2 = b.point;

  // Check if these are paired points (endpoint + its continuation)
  const arePaired = checkIfPairedPoints(p1, p2, continuationToEndpoint, endpointToContinuation);

  if (arePaired) {
    // Use shadow boundary order from orientation
    const ep1 = isEndpoint(p1) ? p1 : null;
    const ep2 = isEndpoint(p2) ? p2 : null;

    if (ep1) {
      const orientation = surfaceOrientations.get(ep1.surface.id);
      if (orientation) {
        return getShadowBoundaryOrderFromOrientation(ep1, orientation);
      }
    }
    if (ep2) {
      const orientation = surfaceOrientations.get(ep2.surface.id);
      if (orientation) {
        return -getShadowBoundaryOrderFromOrientation(ep2, orientation);
      }
    }

    // Handle junction pairs: if one is a junction's continuation, the other is a junction hit
    // For junctions that allow pass-through, continuation comes FIRST (like "entering" shadow)
    // This is because we traverse from ceiling to junction, not junction to ceiling
    const jp1 = isJunctionPoint(p1) ? p1 : null;
    const jp2 = isJunctionPoint(p2) ? p2 : null;

    if (jp1 && isHitPoint(p2)) {
      // p1 is junction, p2 is its continuation → continuation (p2) should come first
      return 1; // p2 before p1
    }
    if (jp2 && isHitPoint(p1)) {
      // p2 is junction, p1 is its continuation → continuation (p1) should come first
      return -1; // p1 before p2
    }

    // Check if pairedEndpoint is a JunctionPoint
    if (a.pairedEndpoint && isJunctionPoint(a.pairedEndpoint)) {
      // a.point is a continuation of a junction → junction should come after
      return -1; // continuation (a) before junction
    }
    if (b.pairedEndpoint && isJunctionPoint(b.pairedEndpoint)) {
      // b.point is a continuation of a junction → junction should come after
      return 1; // continuation (b) before junction
    }
  }

  // Get surface info for both points (only for Endpoints, not JunctionPoints)
  const aEndpoint =
    a.pairedEndpoint && isEndpoint(a.pairedEndpoint)
      ? a.pairedEndpoint
      : isEndpoint(p1)
        ? p1
        : null;
  const bEndpoint =
    b.pairedEndpoint && isEndpoint(b.pairedEndpoint)
      ? b.pairedEndpoint
      : isEndpoint(p2)
        ? p2
        : null;
  const aSurface = aEndpoint ? aEndpoint.surface : null;
  const bSurface = bEndpoint ? bEndpoint.surface : null;

  // Same surface: use orientation to determine order
  if (aSurface && bSurface && aSurface.id === bSurface.id) {
    const orientation = surfaceOrientations.get(aSurface.id);
    if (orientation) {
      const aWhich = aEndpoint ? aEndpoint.which : null;
      const bWhich = bEndpoint ? bEndpoint.which : null;

      if (aWhich && bWhich) {
        if (aWhich !== bWhich) {
          const aIsFirst = aWhich === orientation.firstEndpoint;
          return aIsFirst ? -1 : 1;
        }
        // Same endpoint group (endpoint vs its continuation)
        if (isEndpoint(p1) && !isEndpoint(p2)) {
          const order = getShadowBoundaryOrderFromOrientation(p1, orientation);
          return order > 0 ? 1 : -1;
        }
        if (!isEndpoint(p1) && isEndpoint(p2)) {
          const order = getShadowBoundaryOrderFromOrientation(p2, orientation);
          return order > 0 ? -1 : 1;
        }
      }
    }
  }

  // Continuations come after their endpoints
  if (a.pairedEndpoint && !b.pairedEndpoint) {
    return 1;
  }
  if (b.pairedEndpoint && !a.pairedEndpoint) {
    return -1;
  }

  // Final tiebreaker: distance from origin (closer first)
  const dist1 = Math.hypot(a.xy.x - origin.x, a.xy.y - origin.y);
  const dist2 = Math.hypot(b.xy.x - origin.x, b.xy.y - origin.y);
  return dist1 - dist2;
}

// =============================================================================
// CONE CREATION HELPERS
// =============================================================================

/**
 * Create a full 360° cone starting from a point.
 */
export function createFullCone(origin: Vector2): ConeSource {
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
  return (
    cone.startLine === null &&
    cone.leftBoundary.x === cone.rightBoundary.x &&
    cone.leftBoundary.y === cone.rightBoundary.y
  );
}

/**
 * Create a cone that projects through a window (line segment).
 */
export function createConeThroughWindow(
  origin: Vector2,
  windowStart: Vector2,
  windowEnd: Vector2
): ConeSource {
  const cross = crossProduct(origin, windowStart, windowEnd);
  const startLine: Segment = { start: windowStart, end: windowEnd };

  if (cross >= 0) {
    return {
      origin,
      leftBoundary: windowEnd,
      rightBoundary: windowStart,
      startLine,
    };
  }

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

function crossProduct(origin: Vector2, a: Vector2, b: Vector2): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

/**
 * Check if a point is within the angular sector of a cone.
 */
export function isPointInCone(point: Vector2, cone: ConeSource): boolean {
  if (isFullCone(cone)) {
    return true;
  }

  const origin = cone.origin;
  const left = cone.leftBoundary;
  const right = cone.rightBoundary;

  const rightCross = crossProduct(origin, right, point);
  const leftCross = crossProduct(origin, left, point);
  const sectorCross = crossProduct(origin, right, left);

  if (sectorCross >= 0) {
    return rightCross >= 0 && leftCross <= 0;
  }

  return rightCross >= 0 || leftCross <= 0;
}

/**
 * Check if a point is on the far side of the window from the origin.
 */
function isPointPastWindow(origin: Vector2, point: Vector2, window: Segment): boolean {
  const windowDx = window.end.x - window.start.x;
  const windowDy = window.end.y - window.start.y;

  const originRelX = origin.x - window.start.x;
  const originRelY = origin.y - window.start.y;
  const originCross = windowDx * originRelY - windowDy * originRelX;

  const pointRelX = point.x - window.start.x;
  const pointRelY = point.y - window.start.y;
  const pointCross = windowDx * pointRelY - windowDy * pointRelX;

  if (originCross === 0 || pointCross === 0) {
    return true;
  }

  return (originCross > 0 && pointCross < 0) || (originCross < 0 && pointCross > 0);
}

// =============================================================================
// CORNER DETECTION
// =============================================================================

/**
 * Check if an endpoint lies on another GAME surface (corner detection).
 */
function isEndpointOnOtherSurface(
  endpoint: Endpoint,
  obstacles: readonly Surface[],
  _screenBoundaries: ScreenBoundaries
): boolean {
  const point = endpoint.computeXY();
  const ownSurfaceId = endpoint.surface.id;

  for (const surface of obstacles) {
    if (surface.id === ownSurfaceId) continue;
    if (isPointOnSegmentExact(point, surface.segment.start, surface.segment.end)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a point lies on a line segment (exact check).
 * Uses cross product for collinearity and parametric t for segment bounds.
 */
function isPointOnSegmentExact(point: Vector2, segStart: Vector2, segEnd: Vector2): boolean {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Degenerate segment - point must be exactly at segment start
    return point.x === segStart.x && point.y === segStart.y;
  }

  // Cross product for collinearity check
  const cross = (point.x - segStart.x) * dy - (point.y - segStart.y) * dx;
  if (cross !== 0) {
    return false;
  }

  // Parametric t for position along segment
  const t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lenSq;

  // Point must be strictly inside the segment (not at endpoints)
  return t > 0 && t < 1;
}

// =============================================================================
// RAY CASTING WITH SOURCE POINTS
// =============================================================================

/**
 * Cast a ray to an endpoint target.
 */
function castRayToEndpoint(
  origin: Vector2,
  targetEndpoint: Endpoint,
  obstacles: readonly Surface[],
  screenBoundaries: ScreenBoundaries,
  startLine: Segment | null,
  windowSurfaceId?: string
): SourcePoint | null {
  const target = targetEndpoint.computeXY();

  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return null;

  const scale = 10;
  const rayEnd = { x: origin.x + dx * scale, y: origin.y + dy * scale };
  const ray: Ray = { from: origin, to: rayEnd };

  let minT = 0;

  if (startLine) {
    if (windowSurfaceId && targetEndpoint.surface.id === windowSurfaceId) {
      // Window endpoint - ray passes through window by definition
    } else {
      const lineHit = lineLineIntersection(origin, rayEnd, startLine.start, startLine.end);
      if (lineHit.valid && lineHit.s >= 0 && lineHit.s <= 1 && lineHit.t > 0) {
        minT = lineHit.t;
      } else {
        return null;
      }
    }
  }

  const targetT = 1 / scale;

  let closestT = targetT;
  let closestSurface: Surface | null = null;
  let closestS = 0;

  // Check game obstacles (skip for window endpoints)
  if (!windowSurfaceId || targetEndpoint.surface.id !== windowSurfaceId) {
    for (const obstacle of obstacles) {
      if (targetEndpoint.surface.id === obstacle.id) continue;

      const hit = lineLineIntersection(
        origin,
        rayEnd,
        obstacle.segment.start,
        obstacle.segment.end
      );

      if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
        closestT = hit.t;
        closestSurface = obstacle;
        closestS = hit.s;
      }
    }
  }

  // Check screen boundaries (skip for window endpoints)
  if (!windowSurfaceId || targetEndpoint.surface.id !== windowSurfaceId) {
    for (const boundary of screenBoundaries.all) {
      const hit = lineLineIntersection(
        origin,
        rayEnd,
        boundary.segment.start,
        boundary.segment.end
      );

      if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
        closestT = hit.t;
        closestSurface = boundary;
        closestS = hit.s;
      }
    }
  }

  if (closestSurface) {
    return new HitPoint(ray, closestSurface, closestT, closestS);
  }

  return targetEndpoint;
}

/**
 * Check if two points are exactly equal (same coordinates).
 */
function pointsEqual(a: Vector2, b: Vector2): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Cast a ray to an arbitrary target (not necessarily an endpoint).
 * Used for cone boundary rays.
 */
function castRayToTarget(
  origin: Vector2,
  target: Vector2,
  obstacles: readonly Surface[],
  screenBoundaries: ScreenBoundaries,
  startLine: Segment | null
): SourcePoint | null {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return null;

  const scale = 10;
  const rayEnd = { x: origin.x + dx * scale, y: origin.y + dy * scale };
  const ray: Ray = { from: origin, to: rayEnd };

  let minT = 0;

  if (startLine) {
    const targetIsStartLineEndpoint =
      pointsEqual(target, startLine.start) || pointsEqual(target, startLine.end);

    if (targetIsStartLineEndpoint) {
      minT = 1 / scale;
    } else {
      const lineHit = lineLineIntersection(origin, rayEnd, startLine.start, startLine.end);
      if (lineHit.valid && lineHit.s >= 0 && lineHit.s <= 1 && lineHit.t > 0) {
        minT = lineHit.t;
      } else {
        return null;
      }
    }
  }

  let closestT = Number.POSITIVE_INFINITY;
  let closestSurface: Surface | null = null;
  let closestS = 0;

  for (const obstacle of obstacles) {
    const hit = lineLineIntersection(origin, rayEnd, obstacle.segment.start, obstacle.segment.end);
    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      closestT = hit.t;
      closestSurface = obstacle;
      closestS = hit.s;
    }
  }

  for (const boundary of screenBoundaries.all) {
    const hit = lineLineIntersection(origin, rayEnd, boundary.segment.start, boundary.segment.end);
    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      closestT = hit.t;
      closestSurface = boundary;
      closestS = hit.s;
    }
  }

  if (closestSurface) {
    return new HitPoint(ray, closestSurface, closestT, closestS);
  }

  return null;
}

/**
 * Cast a ray to find what's beyond an endpoint (continuation hit).
 */
function castContinuationRay(
  origin: Vector2,
  throughEndpoint: Endpoint,
  allObstacles: readonly Surface[],
  _screenBoundaries: ScreenBoundaries,
  startLine: Segment | null,
  windowSurfaceId?: string
): SourcePoint | null {
  const target = throughEndpoint.computeXY();
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return null;

  const scale = 10;
  const rayEnd = { x: origin.x + dx * scale, y: origin.y + dy * scale };
  const ray: Ray = { from: origin, to: rayEnd };

  const endpointT = 1 / scale;
  let minT = endpointT;

  if (startLine) {
    if (windowSurfaceId && throughEndpoint.surface.id === windowSurfaceId) {
      // Window endpoint - continuation ray passes through window by definition
    } else {
      const lineHit = lineLineIntersection(origin, rayEnd, startLine.start, startLine.end);
      if (lineHit.valid && lineHit.s >= 0 && lineHit.s <= 1 && lineHit.t > 0) {
        minT = Math.max(lineHit.t, endpointT);
      } else {
        return null;
      }
    }
  }

  let closestT = Number.POSITIVE_INFINITY;
  let closestSurface: Surface | null = null;
  let closestS = 0;

  for (const obstacle of allObstacles) {
    if (obstacle.id === throughEndpoint.surface.id) continue;

    const hit = lineLineIntersection(origin, rayEnd, obstacle.segment.start, obstacle.segment.end);
    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      closestT = hit.t;
      closestSurface = obstacle;
      closestS = hit.s;
    }
  }

  if (closestSurface) {
    return new HitPoint(ray, closestSurface, closestT, closestS);
  }

  return null;
}

/**
 * Cast a continuation ray through a JunctionPoint.
 * Similar to castContinuationRay, but excludes BOTH surfaces at the junction.
 */
function castContinuationRayForJunction(
  origin: Vector2,
  junction: JunctionPoint,
  allObstacles: readonly Surface[],
  _screenBoundaries: ScreenBoundaries,
  startLine: Segment | null
): SourcePoint | null {
  const target = junction.computeXY();
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return null;

  const scale = 10;
  const rayEnd = { x: origin.x + dx * scale, y: origin.y + dy * scale };
  const ray: Ray = { from: origin, to: rayEnd };

  const junctionT = 1 / scale;
  let minT = junctionT;

  // For windowed cones, check if ray passes through window
  if (startLine) {
    const lineHit = lineLineIntersection(origin, rayEnd, startLine.start, startLine.end);
    if (lineHit.valid && lineHit.s >= 0 && lineHit.s <= 1 && lineHit.t > 0) {
      minT = Math.max(lineHit.t, junctionT);
    } else {
      return null;
    }
  }

  // Get the IDs of both surfaces at the junction
  const surfaceBeforeId = junction.getSurfaceBefore()?.id;
  const surfaceAfterId = junction.getSurfaceAfter()?.id;

  let closestT = Number.POSITIVE_INFINITY;
  let closestSurface: Surface | null = null;
  let closestS = 0;

  for (const obstacle of allObstacles) {
    // Skip both surfaces that form this junction
    if (obstacle.id === surfaceBeforeId || obstacle.id === surfaceAfterId) continue;

    const hit = lineLineIntersection(origin, rayEnd, obstacle.segment.start, obstacle.segment.end);
    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      closestT = hit.t;
      closestSurface = obstacle;
      closestS = hit.s;
    }
  }

  if (closestSurface) {
    return new HitPoint(ray, closestSurface, closestT, closestS);
  }

  return null;
}

// =============================================================================
// MAIN ALGORITHM
// =============================================================================

/**
 * Project a cone through obstacles to create a visibility polygon.
 *
 * Returns SourcePoint[] for exact operations, with computeXY() for rendering.
 */
export function projectConeV2(
  source: ConeSource,
  chains: readonly SurfaceChain[],
  bounds: ScreenBoundsConfig,
  excludeSurfaceId?: string
): SourcePoint[] {
  const { origin, startLine } = source;
  const isWindowed = startLine !== null;
  const vertices: SourcePoint[] = [];

  // Extract surfaces from chains
  const obstacles: Surface[] = [];
  for (const chain of chains) {
    obstacles.push(...chain.getSurfaces());
  }

  // Create screen boundaries - both old format (for ray casting) and chain (for corners)
  const screenBoundaries = createScreenBoundaries(bounds);
  const screenChain = createScreenBoundaryChain(bounds);

  // Filter out excluded surface
  const effectiveObstacles = excludeSurfaceId
    ? obstacles.filter((o) => o.id !== excludeSurfaceId)
    : obstacles;

  // Collect all ray targets (Endpoints and JunctionPoints)
  type RayTarget = Endpoint | JunctionPoint;
  const rayTargets: RayTarget[] = [];

  // Collect junction coordinates to avoid duplicate endpoints
  // JunctionPoints handle their own positions, so skip endpoints at junction coords
  const junctionCoords = new Set<string>();
  for (const chain of chains) {
    for (const junction of chain.getJunctionPoints()) {
      const xy = junction.computeXY();
      junctionCoords.add(`${xy.x},${xy.y}`);
    }
  }

  // Add game surface endpoints, but skip those at junction positions
  for (const obstacle of obstacles) {
    const startXY = obstacle.segment.start;
    const endXY = obstacle.segment.end;
    const startKey = `${startXY.x},${startXY.y}`;
    const endKey = `${endXY.x},${endXY.y}`;

    // Only add endpoint if it's NOT at a junction position
    if (!junctionCoords.has(startKey)) {
      rayTargets.push(startOf(obstacle));
    }
    if (!junctionCoords.has(endKey)) {
      rayTargets.push(endOf(obstacle));
    }
  }

  // Add game chain JunctionPoints (internal vertices where surfaces meet)
  for (const chain of chains) {
    for (const junction of chain.getJunctionPoints()) {
      rayTargets.push(junction);
    }
  }

  // Add screen boundary ray targets
  // For closed chains (like screen boundary), all vertices are JunctionPoints
  // For open chains, we add both endpoints (exposed ends) and JunctionPoints (internal vertices)
  if (screenChain.isClosed) {
    // Closed chain: only JunctionPoints (all 4 corners)
    for (const junction of screenChain.getJunctionPoints()) {
      rayTargets.push(junction);
    }
  } else {
    // Open chain: add endpoints for exposed ends
    for (const screenSurface of screenChain.getSurfaces()) {
      rayTargets.push(startOf(screenSurface));
      rayTargets.push(endOf(screenSurface));
    }
    for (const junction of screenChain.getJunctionPoints()) {
      rayTargets.push(junction);
    }
  }

  // For windowed cones, add window endpoints to polygon
  if (isWindowed && startLine) {
    vertices.push(new OriginPoint(startLine.start));
    vertices.push(new OriginPoint(startLine.end));
  }

  // Pre-compute surface orientations for sorting and junction pass-through checks
  // This is done BEFORE the main loop so orientations are available for junction decisions
  const surfaceOrientations = new Map<string, SurfaceOrientation>();

  // Compute orientations for all surfaces (from both game chains and screen chain)
  for (const surface of [...obstacles, ...screenChain.getSurfaces()]) {
    if (!surfaceOrientations.has(surface.id)) {
      surfaceOrientations.set(surface.id, computeSurfaceOrientation(surface, origin));
    }
  }

  // Track ray pairs: endpoint/junction + continuation that share the same ray
  const rayPairs = new Map<
    string,
    { endpoint: Endpoint | JunctionPoint; continuation: SourcePoint | null }
  >();

  // Cast rays to each target within the cone
  for (const target of rayTargets) {
    const targetXY = target.computeXY();

    // Skip if target is at origin
    if (targetXY.x === origin.x && targetXY.y === origin.y) continue;

    // Check if this is a window endpoint (definitionally in cone)
    const isWindowEndpoint =
      isWindowed &&
      startLine &&
      ((targetXY.x === startLine.start.x && targetXY.y === startLine.start.y) ||
        (targetXY.x === startLine.end.x && targetXY.y === startLine.end.y));

    // Check if target is in cone
    if (!isWindowEndpoint && !isPointInCone(targetXY, source)) {
      continue;
    }

    // For windowed cones, verify target is PAST the window
    if (isWindowed && startLine && !isWindowEndpoint) {
      if (!isPointPastWindow(origin, targetXY, startLine)) continue;
    }

    // Handle JunctionPoints - junction can block its own ray
    if (isJunctionPoint(target)) {
      // Check if junction blocks its own ray using pre-computed orientations
      const canPass = target.canLightPassWithOrientations(surfaceOrientations);

      // Get the junction's surfaces for provenance-based checks
      const beforeSurface = target.getSurfaceBefore();
      const afterSurface = target.getSurfaceAfter();
      const beforeSurfaceId = beforeSurface?.id;
      const afterSurfaceId = afterSurface?.id;

      // Filter out the junction's own surfaces from obstacles
      // This ensures we only detect BLOCKING by OTHER surfaces
      const obstaclesExcludingJunction = effectiveObstacles.filter(
        (o) => o.id !== beforeSurfaceId && o.id !== afterSurfaceId
      );

      // Cast ray to the junction point, excluding junction's surfaces
      const blockingHit = castRayToTarget(
        origin,
        targetXY,
        obstaclesExcludingJunction,
        screenBoundaries,
        startLine
      );

      // Determine if ray reaches the junction:
      // If blockingHit is null OR blockingHit is past the junction, ray reaches junction
      // We compare using the ray's t-parameter for robustness
      let reachesJunction = false;
      if (blockingHit === null) {
        // No obstacle blocks - ray reaches the junction
        reachesJunction = true;
      } else if (isHitPoint(blockingHit)) {
        // Check if the blocking hit is AT or PAST the target
        // Use the original ray to compute target's t-value
        const dx = targetXY.x - origin.x;
        const dy = targetXY.y - origin.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq > 0) {
          const scale = 10;
          const targetT = 1 / scale; // Same scale as castRayToTarget
          // If blocking hit is at or past target, ray reaches junction
          if (blockingHit.t >= targetT) {
            reachesJunction = true;
          }
        }
      }

      if (reachesJunction) {
        // Ray reaches the junction - add JunctionPoint DIRECTLY using provenance
        // JunctionPoint has exact coordinates from chain definition, no computation needed
        vertices.push(target);

        // If junction allows pass-through, cast continuation
        if (canPass) {
          const continuation = castContinuationRayForJunction(
            origin,
            target,
            [...effectiveObstacles, ...screenBoundaries.all],
            screenBoundaries,
            startLine
          );
          if (continuation) {
            vertices.push(continuation);
            // Key by JunctionPoint's key since that's what we add to vertices
            rayPairs.set(target.getKey(), { endpoint: target, continuation });
          }
        }
        // If junction blocks (!canPass), we still add the junction but no continuation
      } else if (blockingHit) {
        // Ray is blocked by another obstacle before reaching the junction
        // Add the blocking hit to the polygon
        vertices.push(blockingHit);
      }
      continue;
    }

    // Handle Endpoints - same pattern as non-blocking junctions:
    // 1. Check obstructions BEFORE endpoint (castRayToEndpoint returns Endpoint or blocking HitPoint)
    // 2. Add Endpoint directly (provenance) if not blocked, or blocking HitPoint if blocked
    // 3. Cast continuation ray and pair with Endpoint
    const targetEndpoint = target as Endpoint;
    const hit = castRayToEndpoint(
      origin,
      targetEndpoint,
      effectiveObstacles,
      screenBoundaries,
      startLine,
      excludeSurfaceId
    );

    if (hit) {
      vertices.push(hit);

      // If we hit the endpoint (not blocked), also cast continuation ray
      if (isEndpoint(hit) && hit.equals(targetEndpoint)) {
        const isAtCorner = isEndpointOnOtherSurface(
          targetEndpoint,
          effectiveObstacles,
          screenBoundaries
        );

        if (!isAtCorner) {
          const continuation = castContinuationRay(
            origin,
            targetEndpoint,
            [...effectiveObstacles, ...screenBoundaries.all],
            screenBoundaries,
            startLine,
            excludeSurfaceId
          );

          if (continuation) {
            vertices.push(continuation);
            rayPairs.set(targetEndpoint.getKey(), { endpoint: targetEndpoint, continuation });
          }
        }
      }
    }
  }

  // For windowed cones, cast rays to cone boundaries (extends to screen)
  // These rays find where the cone edges hit the screen boundaries.
  // 
  // IMPORTANT: We need to exclude surfaces that start/end at the window endpoints
  // to prevent HitPoints at junction positions (e.g., s≈0 on a surface starting
  // at the junction). The window endpoints are already represented by OriginPoints.
  if (!isFullCone(source)) {
    // Build set of surfaces to exclude (those starting/ending at window endpoints)
    const windowEndpointSurfaces = new Set<string>();
    for (const chain of chains) {
      for (const surface of chain.getSurfaces()) {
        const startKey = `${surface.segment.start.x},${surface.segment.start.y}`;
        const endKey = `${surface.segment.end.x},${surface.segment.end.y}`;
        const leftKey = `${source.leftBoundary.x},${source.leftBoundary.y}`;
        const rightKey = `${source.rightBoundary.x},${source.rightBoundary.y}`;
        if (startKey === leftKey || endKey === leftKey || startKey === rightKey || endKey === rightKey) {
          windowEndpointSurfaces.add(surface.id);
        }
      }
    }

    // Filter out surfaces at window endpoints
    const obstaclesExcludingWindowEndpoints = effectiveObstacles.filter(
      (o) => !windowEndpointSurfaces.has(o.id)
    );

    const leftHit = castRayToTarget(
      origin,
      source.leftBoundary,
      obstaclesExcludingWindowEndpoints,
      screenBoundaries,
      startLine
    );
    if (leftHit) vertices.push(leftHit);

    const rightHit = castRayToTarget(
      origin,
      source.rightBoundary,
      obstaclesExcludingWindowEndpoints,
      screenBoundaries,
      startLine
    );
    if (rightHit) vertices.push(rightHit);
  }

  // Remove duplicate points using equals()
  const uniqueVertices = removeDuplicatesSourcePoint(vertices);

  // Sort by angle from origin, using ray pairs for tie-breaking
  const sorted = sortPolygonVerticesSourcePoint(uniqueVertices, origin, startLine, rayPairs);

  return sorted;
}

/**
 * Remove duplicate SourcePoints using equals() AND coordinate match.
 *
 * Also handles provenance-based deduplication:
 * - OriginPoints (window endpoints) take precedence over JunctionPoints at the same position
 * - Screen boundary points are deduplicated by coordinates
 */
function removeDuplicatesSourcePoint(points: SourcePoint[]): SourcePoint[] {
  const result: SourcePoint[] = [];
  const seenScreenCornerCoords = new Set<string>();

  // First pass: collect all OriginPoint coordinates (window endpoints)
  // These have provenance priority - other points at same position are redundant
  // Use EXACT coordinates from the OriginPoint (provenance-based)
  const originPointCoords = new Set<string>();
  for (const p of points) {
    if (isOriginPoint(p)) {
      const xy = p.computeXY();
      originPointCoords.add(`${xy.x},${xy.y}`);
    }
  }

  for (const p of points) {
    const xy = p.computeXY();
    const coordKey = `${xy.x},${xy.y}`;

    // Check for exact duplicates using equals()
    let isDuplicate = false;
    for (const existing of result) {
      if (p.equals(existing)) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) continue;

    // For JunctionPoints and Endpoints: skip if an OriginPoint exists at same position
    // (OriginPoint from window definition takes precedence - provenance-based dedup)
    if ((isJunctionPoint(p) || isEndpoint(p)) && originPointCoords.has(coordKey)) {
      continue;
    }

    // For screen boundary endpoints: deduplicate by coordinates
    const isScreenBoundary = isEndpoint(p) && p.surface.id.startsWith("screen-");
    if (isScreenBoundary) {
      if (seenScreenCornerCoords.has(coordKey)) continue;
      seenScreenCornerCoords.add(coordKey);
    }

    result.push(p);
  }

  return result;
}

/**
 * Ray pair info tracked during ray casting.
 */
type RayPairMap = Map<
  string,
  { endpoint: Endpoint | JunctionPoint; continuation: SourcePoint | null }
>;

/**
 * Sort polygon vertices by direction from origin.
 */
function sortPolygonVerticesSourcePoint(
  points: SourcePoint[],
  origin: Vector2,
  startLine: Segment | null,
  rayPairs: RayPairMap
): SourcePoint[] {
  if (points.length === 0) return [];

  // Build a map from continuation point key to its paired endpoint/junction
  const continuationToEndpoint = new Map<string, Endpoint | JunctionPoint>();
  for (const pair of rayPairs.values()) {
    if (pair.continuation) {
      continuationToEndpoint.set(pair.continuation.getKey(), pair.endpoint);
    }
  }

  // PRE-COMPUTE SURFACE ORIENTATIONS
  const surfaceOrientations = new Map<string, SurfaceOrientation>();
  for (const p of points) {
    if (isEndpoint(p)) {
      const surfaceId = p.surface.id;
      if (!surfaceOrientations.has(surfaceId)) {
        surfaceOrientations.set(surfaceId, computeSurfaceOrientation(p.surface, origin));
      }
    }
  }

  // Build sortable point data
  const pointsWithData = points.map((p) => {
    const xy = p.computeXY();

    let pairedEndpoint: Endpoint | JunctionPoint | null = null;
    if (isHitPoint(p)) {
      pairedEndpoint = continuationToEndpoint.get(p.getKey()) ?? null;
    }

    return { point: p, xy, pairedEndpoint };
  });

  // Build reverse map: endpoint/junction HitPoint key → its continuation
  // For endpoints: key is endpoint.getKey()
  // For junctions: key is the HitPoint's key (same as rayPairs key)
  const endpointToContinuation = new Map<string, SourcePoint>();
  for (const [key, pair] of rayPairs.entries()) {
    if (pair.continuation) {
      // Use the rayPairs key directly, which is either:
      // - endpoint.getKey() for regular endpoints
      // - exactHit.getKey() for junction HitPoints
      endpointToContinuation.set(key, pair.continuation);
    }
  }

  // Reference direction for half-plane split
  let refDirection: Vector2;
  if (startLine !== null) {
    const startDir = { x: startLine.start.x - origin.x, y: startLine.start.y - origin.y };
    const endDir = { x: startLine.end.x - origin.x, y: startLine.end.y - origin.y };
    const cross = startDir.x * endDir.y - startDir.y * endDir.x;
    const rightBoundary = cross >= 0 ? startLine.end : startLine.start;
    refDirection = { x: rightBoundary.x - origin.x, y: rightBoundary.y - origin.y };
  } else {
    refDirection = { x: 1, y: 0 };
  }

  // Sort using reference-ray based cross-product comparison
  pointsWithData.sort((a, b) =>
    comparePointsCCW(
      a,
      b,
      origin,
      refDirection,
      surfaceOrientations,
      continuationToEndpoint,
      endpointToContinuation
    )
  );

  // For windowed cones, ensure edge points are at the ends
  if (startLine !== null) {
    return arrangeWindowedCone(pointsWithData, origin, startLine);
  }

  return pointsWithData.map((item) => item.point);
}

/**
 * Check if two points are a tracked ray pair (endpoint + its continuation).
 */
function checkIfPairedPoints(
  p1: SourcePoint,
  p2: SourcePoint,
  continuationToEndpoint: Map<string, Endpoint | JunctionPoint>,
  endpointToContinuation: Map<string, SourcePoint>
): boolean {
  if (isHitPoint(p1)) {
    const ep = continuationToEndpoint.get(p1.getKey());
    if (ep && ep.getKey() === p2.getKey()) {
      return true;
    }
  }

  if (isHitPoint(p2)) {
    const ep = continuationToEndpoint.get(p2.getKey());
    if (ep && ep.getKey() === p1.getKey()) {
      return true;
    }
  }

  // Check if p1 has a continuation (endpoint or junction HitPoint)
  const cont1 = endpointToContinuation.get(p1.getKey());
  if (cont1 && cont1.getKey() === p2.getKey()) {
    return true;
  }

  // Check if p2 has a continuation (endpoint or junction HitPoint)
  const cont2 = endpointToContinuation.get(p2.getKey());
  if (cont2 && cont2.getKey() === p1.getKey()) {
    return true;
  }

  return false;
}

/**
 * Arrange points for windowed cone, ensuring edge points are at ends.
 */
function arrangeWindowedCone(
  sortedPoints: Array<{
    point: SourcePoint;
    xy: Vector2;
    pairedEndpoint: Endpoint | JunctionPoint | null;
  }>,
  origin: Vector2,
  startLine: Segment
): SourcePoint[] {
  const leftEdge: SourcePoint[] = [];
  const rightEdge: SourcePoint[] = [];
  const middle: SourcePoint[] = [];

  const startDir = { x: startLine.start.x - origin.x, y: startLine.start.y - origin.y };
  const endDir = { x: startLine.end.x - origin.x, y: startLine.end.y - origin.y };
  const cross = startDir.x * endDir.y - startDir.y * endDir.x;

  let leftXY: Vector2;
  let rightXY: Vector2;

  if (cross >= 0) {
    leftXY = startLine.start;
    rightXY = startLine.end;
  } else {
    leftXY = startLine.end;
    rightXY = startLine.start;
  }

  for (const item of sortedPoints) {
    if (item.xy.x === leftXY.x && item.xy.y === leftXY.y) {
      leftEdge.push(item.point);
    } else if (item.xy.x === rightXY.x && item.xy.y === rightXY.y) {
      rightEdge.push(item.point);
    } else {
      middle.push(item.point);
    }
  }

  return [...leftEdge, ...middle, ...rightEdge];
}

/**
 * Convert SourcePoint[] to Vector2[] for rendering.
 */
export function toVector2Array(points: SourcePoint[]): Vector2[] {
  return points.map((p) => p.computeXY());
}
