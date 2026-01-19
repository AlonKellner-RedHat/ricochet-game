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
  type Endpoint,
  HitPoint,
  ArcIntersectionPoint,
  OriginPoint,
  ArcHitPoint,
  ArcJunctionPoint,
  type SourcePoint,
  endOf,
  isEndpoint,
  isHitPoint,
  isArcIntersectionPoint,
  isArcJunctionPoint,
  isOriginPoint,
  isArcHitPoint,
  startOf,
} from "@/trajectory-v2/geometry/SourcePoint";
import { computeLineCircleIntersections } from "@/trajectory-v2/geometry/RangeLimitOps";
import {
  type JunctionPoint,
  type SurfaceChain,
  isJunctionPoint,
} from "@/trajectory-v2/geometry/SurfaceChain";
import type { Ray, Vector2, Segment } from "@/trajectory-v2/geometry/types";
import { ContinuationRay } from "@/trajectory-v2/geometry/ContinuationRay";
import type { ReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import type { ReflectedTargetSet } from "./ReflectedTargets";
import type { RangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";

/**
 * Configuration for range limit in visibility projection.
 */
export interface RangeLimitConfig {
  readonly pair: RangeLimitPair;
  readonly center: Vector2;
}

// Re-export Segment for backward compatibility
export type { Segment };

// =============================================================================
// FEATURE FLAGS
// =============================================================================

/**
 * Enable image-space ray casting using reflected target positions.
 *
 * When true, rays are cast from reflectedOrigin to reflectedTarget in Stage 2+,
 * providing full image-space visibility calculation.
 *
 * When false (default), rays are cast from reflectedOrigin to world-space targets,
 * which is the current behavior that's well-tested.
 *
 * Set to true after thorough testing to enable full unified integration.
 *
 * @experimental This feature is experimental. Enable at your own risk.
 */
export const USE_REFLECTED_TARGETS = false;

// =============================================================================
// TYPES
// =============================================================================

/**
 * A segment that preserves SourcePoint provenance.
 *
 * When extracting visible segments from a polygon, we want to preserve
 * the original SourcePoint (JunctionPoint, Endpoint, HitPoint) so that
 * provenance flows through the reflection cascade.
 *
 * This enables `extractVisibleSurfaceSegments` to correctly identify
 * JunctionPoints as being on both adjacent surfaces.
 */
export interface SourceSegment {
  readonly start: Vector2;
  readonly end: Vector2;
  /** Original SourcePoint for start, if available */
  readonly startSource?: SourcePoint;
  /** Original SourcePoint for end, if available */
  readonly endSource?: SourcePoint;
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
  /** Original SourcePoint for left boundary, preserves JunctionPoint provenance */
  readonly leftBoundarySource?: SourcePoint;
  /** Original SourcePoint for right boundary, preserves JunctionPoint provenance */
  readonly rightBoundarySource?: SourcePoint;
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

// =============================================================================
// PRE-COMPUTED PAIRS
// =============================================================================

/**
 * Sort order for a pair of points in CCW polygon traversal.
 * -1: first point comes before second
 *  1: second point comes before first
 */
export type SortOrder = -1 | 1;

/**
 * Pre-computed sort orders for pairs of points.
 *
 * Stores three types of pairs:
 * 1. Surface orientation pairs (start vs end endpoints)
 * 2. Endpoint + Continuation pairs
 * 3. Junction + Continuation pairs
 *
 * This simplifies comparePointsCCW to a simple cross product comparison.
 */
export class PreComputedPairs {
  private readonly pairs = new Map<string, SortOrder>();

  /**
   * Create a key for a pair of points.
   * Order matters: (a, b) and (b, a) are different keys.
   */
  private makeKey(a: SourcePoint, b: SourcePoint): string {
    return `${a.getKey()}|${b.getKey()}`;
  }

  /**
   * Store a pre-computed sort order for a pair of points.
   *
   * @param a First point
   * @param b Second point
   * @param order Sort order: -1 if a before b, 1 if b before a
   */
  set(a: SourcePoint, b: SourcePoint, order: SortOrder): void {
    this.pairs.set(this.makeKey(a, b), order);
  }

  /**
   * Get the pre-computed sort order for a pair of points.
   *
   * Automatically handles reverse lookup: if (a, b) is not found,
   * checks for (b, a) and returns the negated order.
   *
   * @param a First point
   * @param b Second point
   * @returns The sort order, or undefined if not pre-computed
   */
  get(a: SourcePoint, b: SourcePoint): SortOrder | undefined {
    // Check forward
    const forward = this.pairs.get(this.makeKey(a, b));
    if (forward !== undefined) return forward;

    // Check reverse (flip the order)
    const reverse = this.pairs.get(this.makeKey(b, a));
    if (reverse !== undefined) return (reverse === -1 ? 1 : -1) as SortOrder;

    return undefined;
  }

  /**
   * Check if a pair has been pre-computed.
   */
  has(a: SourcePoint, b: SourcePoint): boolean {
    return this.get(a, b) !== undefined;
  }

  /**
   * Get the number of stored pairs.
   */
  get size(): number {
    return this.pairs.size;
  }
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
  // Non-positive: end comes first
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
 *
 * @param origin Where rays converge toward
 * @param windowStart First endpoint of the window
 * @param windowEnd Second endpoint of the window
 * @param windowStartSource Optional SourcePoint for windowStart (preserves JunctionPoint provenance)
 * @param windowEndSource Optional SourcePoint for windowEnd (preserves JunctionPoint provenance)
 */
export function createConeThroughWindow(
  origin: Vector2,
  windowStart: Vector2,
  windowEnd: Vector2,
  windowStartSource?: SourcePoint,
  windowEndSource?: SourcePoint
): ConeSource {
  const cross = crossProduct(origin, windowStart, windowEnd);
  const startLine: Segment = { start: windowStart, end: windowEnd };

  if (cross >= 0) {
    // leftBoundary = windowEnd, rightBoundary = windowStart
    return {
      origin,
      leftBoundary: windowEnd,
      rightBoundary: windowStart,
      startLine,
      leftBoundarySource: windowEndSource,
      rightBoundarySource: windowStartSource,
    };
  }

  // leftBoundary = windowStart, rightBoundary = windowEnd
  return {
    origin,
    leftBoundary: windowStart,
    rightBoundary: windowEnd,
    startLine,
    leftBoundarySource: windowStartSource,
    rightBoundarySource: windowEndSource,
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
// RAY CASTING WITH SOURCE POINTS
// =============================================================================

/**
 * Result of casting a ray (unified for all modes).
 */
interface CastRayResult {
  /** The result of the ray cast (target, blocking hit, or blocking junction) */
  hit: SourcePoint | null;
  /** Endpoints that were passed through (non-blocking) */
  passedThroughEndpoints: Endpoint[];
}

/**
 * Unified ray casting function.
 *
 * Supports two modes:
 * - "to": Cast ray TO the target, stops at target or first blocking obstacle
 * - "through": Cast ray THROUGH the target, continues past to find what's beyond
 *
 * Always tracks passed-through endpoints for ContinuationRay provenance.
 *
 * Uses OCP: target.getExcludedSurfaceIds() determines which surfaces to skip.
 *
 * @param origin - Where the ray originates
 * @param target - The Endpoint or JunctionPoint to cast toward/through
 * @param mode - "to" stops at target, "through" continues past it
 * @param obstacles - All surfaces to check for intersections
 * @param startLine - Optional start line (for windowed cones)
 * @param windowSurfaceId - Optional window surface ID to skip special handling
 * @param chains - All surface chains for finding SourcePoints at positions
 * @param surfaceOrientations - Pre-computed surface orientations
 * @param windowContext - Optional window context for blocking checks
 * @param endpointCache - Optional cache for consistent Endpoint object references
 */
function castRay(
  origin: Vector2,
  target: Endpoint | JunctionPoint,
  mode: "to" | "through",
  obstacles: readonly Surface[],
  startLine: Segment | null,
  windowSurfaceId: string | undefined,
  chains: readonly SurfaceChain[],
  surfaceOrientations: Map<string, SurfaceOrientation>,
  windowContext: WindowContext | null,
  endpointCache?: Map<string, Endpoint>
): CastRayResult {
  const emptyResult: CastRayResult = { hit: null, passedThroughEndpoints: [] };
  const passedThroughEndpoints: Endpoint[] = [];
  const targetXY = target.computeXY();
  const excludedIds = target.getExcludedSurfaceIds();

  const dx = targetXY.x - origin.x;
  const dy = targetXY.y - origin.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return emptyResult;

  const scale = 10;
  const rayEnd = { x: origin.x + dx * scale, y: origin.y + dy * scale };
  const ray: Ray = { source: origin, target: rayEnd };

  const targetT = 1 / scale;

  // minT: where the ray starts checking
  // - "to" mode: from origin (0) or startLine
  // - "through" mode: from past the target (targetT)
  let minT = mode === "through" ? targetT : 0;

  // closestT: where the ray stops
  // - "to" mode: at the target (targetT)
  // - "through" mode: at infinity (find first hit past target)
  let closestT = mode === "through" ? Number.POSITIVE_INFINITY : targetT;

  // Handle startLine (for windowed cones)
  if (startLine) {
    const isWindowTarget =
      windowSurfaceId &&
      isEndpoint(target) &&
      target.surface.id === windowSurfaceId;

    if (isWindowTarget) {
      // Window endpoint - ray passes through window by definition
    } else {
      const lineHit = lineLineIntersection(origin, rayEnd, startLine.start, startLine.end);
      if (lineHit.valid && lineHit.s >= 0 && lineHit.s <= 1 && lineHit.t > 0) {
        if (mode === "to") {
          minT = lineHit.t;
        } else {
          minT = Math.max(lineHit.t, targetT);
        }
      } else {
        return emptyResult;
      }
    }
  }

  let closestSurface: Surface | null = null;
  let closestS = 0;
  let closestBlockingJunction: JunctionPoint | null = null;

  // ==========================================================================
  // PROVENANCE-BASED JUNCTION DETECTION FOR COLLINEAR SURFACES
  // ==========================================================================
  // If the target is an Endpoint and the origin lies on the target's surface line
  // (crossProduct === 0), check if there's a blocking junction at the other end.
  // This uses provenance instead of floating-point intersection math.
  if (mode === "to" && isEndpoint(target)) {
    const targetSurface = target.surface;
    const orientation = surfaceOrientations.get(targetSurface.id);

    // crossProduct === 0 means origin is on the line of this surface
    if (orientation && orientation.crossProduct === 0) {
      // Find which end of the surface the target is at
      const targetWhich = target.which; // "start" or "end"
      const otherWhich = targetWhich === "start" ? "end" : "start";

      // Get the position of the OTHER end of the surface
      const otherEndPos =
        otherWhich === "start" ? targetSurface.segment.start : targetSurface.segment.end;

      // Check if there's a junction at the other end
      for (const chain of chains) {
        for (const junction of chain.getJunctionPoints()) {
          const jxy = junction.computeXY();
          if (jxy.x === otherEndPos.x && jxy.y === otherEndPos.y) {
            // Found a junction at the other end of the target's surface
            // Check if this junction is BETWEEN origin and target
            // (i.e., closer to origin than the target)
            const jDist = (jxy.x - origin.x) ** 2 + (jxy.y - origin.y) ** 2;
            const tDist = (targetXY.x - origin.x) ** 2 + (targetXY.y - origin.y) ** 2;

            if (jDist < tDist) {
              // Junction is between origin and target
              // Check if it's blocking
              if (junction.isBlocking(surfaceOrientations, windowContext ?? undefined)) {
                // Junction blocks the ray - return junction as the hit
                return { hit: junction, passedThroughEndpoints: [] };
              } else {
                // Junction is non-blocking - track as passed-through
                // (Junctions aren't Endpoints, so we don't add to passedThroughEndpoints)
                // But we should continue to the target
              }
            }
          }
        }
      }
    }
  }

  // Check for window target skip (only in "to" mode)
  const skipObstacles =
    mode === "to" &&
    windowSurfaceId &&
    isEndpoint(target) &&
    target.surface.id === windowSurfaceId;

  if (!skipObstacles) {
    for (const obstacle of obstacles) {
      // Skip target's own surfaces (using OCP method)
      if (excludedIds.includes(obstacle.id)) continue;

      const hit = lineLineIntersection(
        origin,
        rayEnd,
        obstacle.segment.start,
        obstacle.segment.end
      );

      if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
        // Check if hit is at an endpoint position (s=0 or s=1)
        if (hit.s === 0 || hit.s === 1) {
          const hitPos = hit.s === 0 ? obstacle.segment.start : obstacle.segment.end;
          const sourcePointAtHit = findSourcePointAtEndpoint(hitPos, chains, obstacle, hit.s, endpointCache);

          if (sourcePointAtHit) {
            // Check if this point blocks the ray
            if (!sourcePointAtHit.isBlocking(surfaceOrientations, windowContext ?? undefined)) {
              // Non-blocking point - skip this hit, ray continues through
              // Track passed-through endpoints for ContinuationRay provenance
              if (isEndpoint(sourcePointAtHit)) {
                passedThroughEndpoints.push(sourcePointAtHit);
              }
              continue;
            } else if (isJunctionPoint(sourcePointAtHit)) {
              // Blocking junction - record it as the closest hit
              closestT = hit.t;
              closestSurface = null;
              closestS = hit.s;
              closestBlockingJunction = sourcePointAtHit;
              continue;
            }
          }
        }

        // Normal surface hit (mid-segment)
        closestT = hit.t;
        closestSurface = obstacle;
        closestS = hit.s;
        closestBlockingJunction = null;
      }
    }
  }

  // Return blocking junction if found
  if (closestBlockingJunction) {
    return { hit: closestBlockingJunction, passedThroughEndpoints };
  }

  // Return surface hit if found
  if (closestSurface) {
    return { hit: new HitPoint(ray, closestSurface, closestT, closestS), passedThroughEndpoints };
  }

  // No obstacle hit:
  // - "to" mode: return the target itself
  // - "through" mode: no hit beyond target (return null)
  if (mode === "to") {
    return { hit: target, passedThroughEndpoints };
  }

  return { hit: null, passedThroughEndpoints };
}

// Legacy type alias for backward compatibility during migration
type CastToEndpointResult = CastRayResult;

/**
 * Check if two points are exactly equal (same coordinates).
 */
function pointsEqual(a: Vector2, b: Vector2): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Cast a ray to an arbitrary target (not necessarily an endpoint).
 * Used for cone boundary rays.
 * All obstacles (including screen boundaries) should be in the obstacles array.
 *
 * If a blocking obstacle is at s=0 or s=1 (endpoint position):
 * - Non-blocking points (Endpoint, non-blocking Junction): Skip, ray continues
 * - Blocking Junction: Return the junction directly
 */
function castRayToTarget(
  origin: Vector2,
  target: Vector2,
  obstacles: readonly Surface[],
  startLine: Segment | null,
  chains: readonly SurfaceChain[],
  surfaceOrientations: Map<string, SurfaceOrientation>,
  windowContext: WindowContext | null
): SourcePoint | null {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return null;

  const scale = 10;
  const rayEnd = { x: origin.x + dx * scale, y: origin.y + dy * scale };
  const ray: Ray = { source: origin, target: rayEnd };

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
  let closestBlockingJunction: JunctionPoint | null = null;

  for (const obstacle of obstacles) {
    const hit = lineLineIntersection(origin, rayEnd, obstacle.segment.start, obstacle.segment.end);
    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      // Check if hit is at an endpoint position (s=0 or s=1)
      if (hit.s === 0 || hit.s === 1) {
        const hitPos = hit.s === 0 ? obstacle.segment.start : obstacle.segment.end;
        const sourcePointAtHit = findSourcePointAtEndpoint(hitPos, chains, obstacle, hit.s);

        if (sourcePointAtHit) {
          // Check if this point blocks the ray
          if (!sourcePointAtHit.isBlocking(surfaceOrientations, windowContext ?? undefined)) {
            // Non-blocking point - skip this hit, ray continues through
            continue;
          } else if (isJunctionPoint(sourcePointAtHit)) {
            // Blocking junction - record it as the closest hit
            closestT = hit.t;
            closestSurface = null;
            closestS = hit.s;
            closestBlockingJunction = sourcePointAtHit;
            continue;
          }
        }
      }

      // Normal surface hit (mid-segment)
      closestT = hit.t;
      closestSurface = obstacle;
      closestS = hit.s;
      closestBlockingJunction = null;
    }
  }

  // Return blocking junction if found
  if (closestBlockingJunction) {
    return closestBlockingJunction;
  }

  if (closestSurface) {
    return new HitPoint(ray, closestSurface, closestT, closestS);
  }

  return null;
}

/**
 * Find a SourcePoint (JunctionPoint or Endpoint) at a given position.
 *
 * Used to determine if a ray hit at s=0 or s=1 coincides with a non-blocking point.
 * JunctionPoints take precedence over Endpoints (junctions are shared endpoints).
 *
 * @param pos The position to check
 * @param chains All surface chains to search
 * @param obstacle The surface that was hit (used to get Endpoint if no junction)
 * @param s The segment parameter (0 = start, 1 = end)
 * @param endpointCache Optional cache for consistent Endpoint object references
 * @returns JunctionPoint or Endpoint at position, or null if none found
 */
function findSourcePointAtEndpoint(
  pos: Vector2,
  chains: readonly SurfaceChain[],
  obstacle: Surface,
  s: number,
  endpointCache?: Map<string, Endpoint>
): JunctionPoint | Endpoint | null {
  // First, check if this position is a JunctionPoint
  for (const chain of chains) {
    for (const junction of chain.getJunctionPoints()) {
      const jxy = junction.computeXY();
      if (jxy.x === pos.x && jxy.y === pos.y) {
        return junction;
      }
    }
  }

  // Not a junction - return the Endpoint of the hit surface
  // Use cache if available to ensure consistent object references
  const which = s === 0 ? "start" : s === 1 ? "end" : null;
  if (which) {
    if (endpointCache) {
      const key = `${obstacle.id}:${which}`;
      let endpoint = endpointCache.get(key);
      if (!endpoint) {
        endpoint = which === "start" ? startOf(obstacle) : endOf(obstacle);
        endpointCache.set(key, endpoint);
      }
      return endpoint;
    }
    return which === "start" ? startOf(obstacle) : endOf(obstacle);
  }

  return null;
}

// =============================================================================
// RANGE LIMIT HELPERS
// =============================================================================

/**
 * Check if a point is beyond the range limit.
 */
function isPointBeyondRangeLimit(
  point: Vector2,
  rangeLimit: RangeLimitConfig
): boolean {
  const dx = point.x - rangeLimit.center.x;
  const dy = point.y - rangeLimit.center.y;
  const distSq = dx * dx + dy * dy;
  const radiusSq = rangeLimit.pair.radius * rangeLimit.pair.radius;
  return distSq > radiusSq;
}

/**
 * Compute the range limit intersection point along a ray from origin to target.
 */
function computeRangeLimitIntersection(
  origin: Vector2,
  target: Vector2,
  rangeLimit: RangeLimitConfig
): Vector2 {
  const dx = target.x - rangeLimit.center.x;
  const dy = target.y - rangeLimit.center.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const scale = rangeLimit.pair.radius / dist;
  return {
    x: rangeLimit.center.x + dx * scale,
    y: rangeLimit.center.y + dy * scale,
  };
}

/**
 * Apply range limit to a SourcePoint.
 *
 * If the point is beyond the range limit distance, returns a new HitPoint
 * at the range limit intersection. Otherwise returns the original point.
 *
 * IMPORTANT: Some point types are excluded from range limit processing:
 * - ArcHitPoint: Already represents a range limit hit (has provenance)
 * - ArcIntersectionPoint with "range_limit" type: IS the range limit intersection
 * These exclusions follow the pattern of excluding the range limit when
 * casting toward range limit points - the point itself is the blocking entity.
 */
function applyRangeLimit(
  point: SourcePoint,
  origin: Vector2,
  rangeLimit: RangeLimitConfig | undefined
): SourcePoint {
  if (!rangeLimit) {
    return point;
  }

  // Skip ArcHitPoints - they already have correct provenance from continuation rays
  if (isArcHitPoint(point)) {
    return point;
  }

  // Skip ArcIntersectionPoints that are ON the range limit circle
  // They represent surface-circle intersections and are the correct hit points
  if (isArcIntersectionPoint(point) && point.intersectionType === "range_limit") {
    return point;
  }

  const xy = point.computeXY();
  if (!isPointBeyondRangeLimit(xy, rangeLimit)) {
    return point;
  }

  // Point exceeds range limit - compute point on range limit circle
  // Note: This creates an ArcHitPoint WITHOUT provenance (no raySource)
  // because it's a boundary hit, not from a continuation ray
  const limitedPoint = computeRangeLimitIntersection(origin, xy, rangeLimit);
  return new ArcHitPoint(limitedPoint);
}

/**
 * Result of applying range limit to a continuation ray.
 */
interface RangeLimitedContinuationResult {
  /** The final hit (possibly replaced with ArcHitPoint) */
  hit: SourcePoint | null;
  /** Passed-through endpoints that are within range limit */
  passedThroughEndpoints: Endpoint[];
  /** True if the final hit was replaced with an ArcHitPoint */
  wasLimited: boolean;
}

/**
 * Apply range limit to a continuation ray result.
 *
 * This filters out passed-through endpoints that exceed the range limit,
 * and replaces the final hit with an ArcHitPoint if it exceeds the limit.
 *
 * Used during continuation ray construction so ArcHitPoint becomes
 * a proper member of the ContinuationRay with correct PreComputedPairs.
 *
 * @param origin - The cone origin
 * @param contResult - The continuation ray result to process
 * @param rangeLimit - Optional range limit configuration
 * @param raySource - The source point (endpoint/junction) of the continuation ray (for provenance)
 */
function applyRangeLimitToContinuation(
  origin: Vector2,
  contResult: CastRayResult,
  rangeLimit: RangeLimitConfig | undefined,
  raySource: SourcePoint
): RangeLimitedContinuationResult {
  if (!rangeLimit || !contResult.hit) {
    return {
      hit: contResult.hit,
      passedThroughEndpoints: contResult.passedThroughEndpoints,
      wasLimited: false,
    };
  }

  // Filter passed-through endpoints that are within range limit
  const filteredPassedThrough = contResult.passedThroughEndpoints.filter(
    (ep) => !isPointBeyondRangeLimit(ep.computeXY(), rangeLimit)
  );

  // Check if the final hit exceeds range limit
  const hitXY = contResult.hit.computeXY();
  if (!isPointBeyondRangeLimit(hitXY, rangeLimit)) {
    // Hit is within range - return as-is (with filtered passed-through)
    return {
      hit: contResult.hit,
      passedThroughEndpoints: filteredPassedThrough,
      wasLimited: false,
    };
  }

  // Hit exceeds range limit - replace with ArcHitPoint
  // Pass raySource for provenance-based key stability
  const limitedPoint = computeRangeLimitIntersection(origin, hitXY, rangeLimit);
  return {
    hit: new ArcHitPoint(limitedPoint, raySource),
    passedThroughEndpoints: filteredPassedThrough,
    wasLimited: true,
  };
}

// =============================================================================
// MAIN ALGORITHM
// =============================================================================

/**
 * Project a cone through obstacles to create a visibility polygon.
 *
 * Returns SourcePoint[] for exact operations, with computeXY() for rendering.
 *
 * NOTE: The chains array should include ALL obstacles including the screen boundary chain.
 * Screen boundaries are just another SurfaceChain - no special handling.
 */
export function projectConeV2(
  source: ConeSource,
  chains: readonly SurfaceChain[],
  excludeSurfaceId?: string,
  cache?: ReflectionCache,
  reflectedTargets?: ReflectedTargetSet,
  rangeLimit?: RangeLimitConfig
): SourcePoint[] {
  const { origin, startLine } = source;
  const isWindowed = startLine !== null;
  const vertices: SourcePoint[] = [];

  /**
   * Helper to get target position, using reflected position when available.
   *
   * When USE_REFLECTED_TARGETS is enabled and reflectedTargets is provided (Stage 2+),
   * this returns the reflected position of the target for ray casting in image space.
   * Otherwise, returns the world-space position.
   *
   * Image-space ray casting ensures that the ray direction from reflectedOrigin
   * to reflectedTarget is consistent with the reflection paradigm used by the
   * trajectory system.
   */
  const getTargetPosition = (target: Endpoint | JunctionPoint): Vector2 => {
    // Use reflected position when feature is enabled and reflectedTargets available
    if (USE_REFLECTED_TARGETS && reflectedTargets) {
      return reflectedTargets.getReflected(target);
    }
    // Default: use world-space position
    return target.computeXY();
  };

  // Lookup for HitPoints by position - ensures we reuse the same HitPoint object
  // when multiple continuation rays hit the same position.
  // This ensures PreComputedPairs reference the same object that survives deduplication.
  const hitPointsByPosition = new Map<string, HitPoint>();

  /**
   * Get or create a HitPoint, reusing existing one at same position if available.
   * This ensures PreComputedPairs use consistent object references.
   */
  const getOrCreateHitPoint = (hitPoint: HitPoint): HitPoint => {
    const xy = hitPoint.computeXY();
    const key = `${xy.x},${xy.y}`;
    const existing = hitPointsByPosition.get(key);
    if (existing) {
      return existing;
    }
    hitPointsByPosition.set(key, hitPoint);
    return hitPoint;
  };

  // Extract surfaces from all chains (includes screen boundaries)
  const obstacles: Surface[] = [];
  for (const chain of chains) {
    obstacles.push(...chain.getSurfaces());
  }

  // Compute reference direction (same as used for sorting)
  // For windowed cones: points opposite to window midpoint
  // This ensures consistent CCW ordering without 180° ambiguity
  let refDirection: Vector2;
  if (startLine !== null) {
    const windowMidX = (startLine.start.x + startLine.end.x) / 2;
    const windowMidY = (startLine.start.y + startLine.end.y) / 2;
    refDirection = { x: origin.x - windowMidX, y: origin.y - windowMidY };
  } else {
    refDirection = { x: 1, y: 0 };
  }

  // Build WindowContext for JunctionPoint.isBlocking()
  // This enables encapsulated, provenance-based blocking decisions within junctions
  const windowContext = excludeSurfaceId
    ? { origin, windowSurfaceId: excludeSurfaceId, refDirection }
    : undefined;

  // Build set of surface IDs to exclude
  // Always exclude the planned surface (window)
  // Selectively exclude adjacent surfaces based on geometric test
  const excludedIds = new Set<string>();

  // Track which surfaces at each window endpoint are non-blocking (for cone boundary rays)
  // These are reused later via provenance to avoid recalculating
  const nonBlockingAtLeftBoundary = new Set<string>();
  const nonBlockingAtRightBoundary = new Set<string>();

  if (excludeSurfaceId) {
    excludedIds.add(excludeSurfaceId);

    // Find adjacent surfaces and test if they should block light
    for (const chain of chains) {
      const surfaces = chain.getSurfaces();
      for (let i = 0; i < surfaces.length; i++) {
        if (surfaces[i]!.id === excludeSurfaceId) {
          const windowSurface = surfaces[i]!;

          // Check adjacent surface BEFORE (at window start = left boundary)
          const prevIndex = i > 0 ? i - 1 : chain.isClosed ? surfaces.length - 1 : -1;
          if (prevIndex >= 0) {
            const adjSurface = surfaces[prevIndex]!;
            const junction = windowSurface.segment.start;

            // Compute directions from junction
            const rayDir = { x: junction.x - origin.x, y: junction.y - origin.y };
            const windowOther = windowSurface.segment.end;
            const windowDir = { x: windowOther.x - junction.x, y: windowOther.y - junction.y };
            const adjOther =
              adjSurface.segment.start.x === junction.x && adjSurface.segment.start.y === junction.y
                ? adjSurface.segment.end
                : adjSurface.segment.start;
            const adjacentDir = { x: adjOther.x - junction.x, y: adjOther.y - junction.y };

            if (!shouldAdjacentBlockLight(rayDir, windowDir, adjacentDir, refDirection)) {
              excludedIds.add(adjSurface.id);
              nonBlockingAtLeftBoundary.add(adjSurface.id);
            }
          }

          // Check adjacent surface AFTER (at window end = right boundary)
          const nextIndex = i < surfaces.length - 1 ? i + 1 : chain.isClosed ? 0 : -1;
          if (nextIndex >= 0 && nextIndex !== prevIndex) {
            const adjSurface = surfaces[nextIndex]!;
            const junction = windowSurface.segment.end;

            // Compute directions from junction
            const rayDir = { x: junction.x - origin.x, y: junction.y - origin.y };
            const windowOther = windowSurface.segment.start;
            const windowDir = { x: windowOther.x - junction.x, y: windowOther.y - junction.y };
            const adjOther =
              adjSurface.segment.start.x === junction.x && adjSurface.segment.start.y === junction.y
                ? adjSurface.segment.end
                : adjSurface.segment.start;
            const adjacentDir = { x: adjOther.x - junction.x, y: adjOther.y - junction.y };

            if (!shouldAdjacentBlockLight(rayDir, windowDir, adjacentDir, refDirection)) {
              excludedIds.add(adjSurface.id);
              nonBlockingAtRightBoundary.add(adjSurface.id);
            }
          }
        }
      }
    }
  }

  const effectiveObstacles = obstacles.filter((o) => !excludedIds.has(o.id));

  // Collect all ray targets (Endpoints, JunctionPoints, ArcIntersectionPoints, ArcJunctionPoints)
  type RayTarget = Endpoint | JunctionPoint | ArcIntersectionPoint | ArcJunctionPoint;
  const rayTargets: RayTarget[] = [];

  // Cache endpoints by key to ensure consistent object references
  // This is critical for continuationRay assignment: passed-through endpoints
  // must be the SAME objects as the ones in rayTargets/vertices
  const endpointCache = new Map<string, Endpoint>();
  function getOrCreateEndpoint(surface: Surface, which: "start" | "end"): Endpoint {
    const key = `${surface.id}:${which}`;
    let endpoint = endpointCache.get(key);
    if (!endpoint) {
      endpoint = which === "start" ? startOf(surface) : endOf(surface);
      endpointCache.set(key, endpoint);
    }
    return endpoint;
  }

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
      rayTargets.push(getOrCreateEndpoint(obstacle, "start"));
    }
    if (!junctionCoords.has(endKey)) {
      rayTargets.push(getOrCreateEndpoint(obstacle, "end"));
    }
  }

  // Add JunctionPoints from all chains (including screen boundary corners)
  for (const chain of chains) {
    for (const junction of chain.getJunctionPoints()) {
      rayTargets.push(junction);
    }
  }

  // Add ArcIntersectionPoints where surfaces cross the range limit circle
  // These are critical points for visibility polygon construction
  // IMPORTANT: Use effectiveObstacles (excludes window surface) to honor provenance propagation.
  // If Stage 1 computed an ArcIntersectionPoint on the window, it's passed via leftBoundarySource/
  // rightBoundarySource. We reuse that exact point - no recomputation, no floating-point drift.
  if (rangeLimit) {
    for (const obstacle of effectiveObstacles) {
      const intersections = computeLineCircleIntersections(
        obstacle.segment.start,
        obstacle.segment.end,
        rangeLimit.center,
        rangeLimit.pair.radius
      );

      for (const { t } of intersections) {
        // Only add if t is strictly in (0, 1) - endpoints are already covered by Endpoint
        if (t > 0 && t < 1) {
          rayTargets.push(new ArcIntersectionPoint(obstacle, t, "range_limit"));
        }
      }
    }

    // Add ArcJunctionPoints at semi-circle boundaries
    // These are where the top/bottom (horizontal) or left/right (vertical) semi-circles meet
    const { center, pair } = rangeLimit;
    if (pair.orientation === "horizontal") {
      // Left and right boundaries (where top and bottom meet)
      rayTargets.push(
        new ArcJunctionPoint(
          { x: center.x - pair.radius, y: center.y },
          "top",
          "bottom",
          "left"
        )
      );
      rayTargets.push(
        new ArcJunctionPoint(
          { x: center.x + pair.radius, y: center.y },
          "top",
          "bottom",
          "right"
        )
      );
    } else {
      // Top and bottom boundaries (where left and right meet)
      rayTargets.push(
        new ArcJunctionPoint(
          { x: center.x, y: center.y - pair.radius },
          "left",
          "right",
          "top"
        )
      );
      rayTargets.push(
        new ArcJunctionPoint(
          { x: center.x, y: center.y + pair.radius },
          "left",
          "right",
          "bottom"
        )
      );
    }
  }

  // For windowed cones, add window endpoints to polygon
  // Track which SourcePoint corresponds to left vs right boundary for PreComputedPairs
  // Preserves JunctionPoint/Endpoint provenance if provided via ConeSource
  let leftWindowOrigin: SourcePoint | null = null;
  let rightWindowOrigin: SourcePoint | null = null;

  if (isWindowed && startLine) {
    // Determine which window point is left vs right boundary
    // (same logic as createConeThroughWindow)
    const startDir = { x: startLine.start.x - origin.x, y: startLine.start.y - origin.y };
    const endDir = { x: startLine.end.x - origin.x, y: startLine.end.y - origin.y };
    const boundaryCross = startDir.x * endDir.y - startDir.y * endDir.x;

    if (boundaryCross >= 0) {
      // leftBoundary = end, rightBoundary = start
      // Use provided SourcePoints if available, otherwise create OriginPoints
      leftWindowOrigin = source.leftBoundarySource ?? new OriginPoint(startLine.end);
      rightWindowOrigin = source.rightBoundarySource ?? new OriginPoint(startLine.start);
    } else {
      // leftBoundary = start, rightBoundary = end
      leftWindowOrigin = source.leftBoundarySource ?? new OriginPoint(startLine.start);
      rightWindowOrigin = source.rightBoundarySource ?? new OriginPoint(startLine.end);
    }

    vertices.push(leftWindowOrigin);
    vertices.push(rightWindowOrigin);
  }

  // Pre-compute surface orientations for sorting and junction pass-through checks
  // This is done BEFORE the main loop so orientations are available for junction decisions
  const surfaceOrientations = new Map<string, SurfaceOrientation>();

  // Pre-computed pairs for CCW sorting
  // Stores: surface endpoint pairs, endpoint+continuation pairs, junction+continuation pairs
  const preComputedPairs = new PreComputedPairs();

  // Compute orientations for all surfaces AND store endpoint pairs
  // obstacles includes all surfaces from all chains (including screen boundaries)
  for (const surface of obstacles) {
    if (!surfaceOrientations.has(surface.id)) {
      const orientation = computeSurfaceOrientation(surface, origin);
      surfaceOrientations.set(surface.id, orientation);

      // Store endpoint pair order in PreComputedPairs
      // This is a Type 1 pair: surface orientation pair
      const startEndpoint = startOf(surface);
      const endEndpoint = endOf(surface);
      if (orientation.crossProduct > 0) {
        // start comes before end in CCW
        preComputedPairs.set(startEndpoint, endEndpoint, -1);
      } else if (orientation.crossProduct < 0) {
        // end comes before start in CCW
        preComputedPairs.set(startEndpoint, endEndpoint, 1);
      } else {
        // crossProduct === 0: Surface is collinear with origin
        // Order by distance from origin (nearer comes first in this degenerate case)
        const startXY = startEndpoint.computeXY();
        const endXY = endEndpoint.computeXY();
        const startDist = (startXY.x - origin.x) ** 2 + (startXY.y - origin.y) ** 2;
        const endDist = (endXY.x - origin.x) ** 2 + (endXY.y - origin.y) ** 2;
        if (startDist < endDist) {
          preComputedPairs.set(startEndpoint, endEndpoint, -1);
        } else {
          preComputedPairs.set(startEndpoint, endEndpoint, 1);
        }
      }
    }
  }

  // ==========================================================================
  // PRE-COMPUTE COLLINEAR ORDERINGS FOR JUNCTIONS ON COLLINEAR SURFACES
  // ==========================================================================
  // For surfaces where crossProduct === 0 (origin on surface line), we need
  // PreComputedPairs between junctions and endpoints on that surface.
  //
  // Use SHADOW BOUNDARY ORDER based on the junction's directional blocking:
  // - CCW blocking → far-before-near (entering shadow in CCW direction)
  // - CW blocking → near-before-far (exiting shadow in CCW direction)
  // - Both/neither → fall back to distance order
  //
  // Also pre-mark these endpoints so they're skipped during endpoint processing.
  const collinearEndpointsToSkip = new Set<string>();

  for (const chain of chains) {
    for (const junction of chain.getJunctionPoints()) {
      const beforeSurface = junction.getSurfaceBefore();
      const afterSurface = junction.getSurfaceAfter();

      // Get junction's blocking status for shadow boundary order
      const junctionStatus = junction.getBlockingStatus(surfaceOrientations);
      let shadowOrder: number;
      if (junctionStatus.isCCWBlocking && !junctionStatus.isCWBlocking) {
        shadowOrder = 1; // far-before-near
      } else if (junctionStatus.isCWBlocking && !junctionStatus.isCCWBlocking) {
        shadowOrder = -1; // near-before-far
      } else {
        shadowOrder = 0; // both or neither - fall back to distance
      }

      // Check if before surface is collinear
      const beforeOrientation = surfaceOrientations.get(beforeSurface.id);
      if (beforeOrientation && beforeOrientation.crossProduct === 0) {
        // Junction is at one end of a collinear surface
        // Add pair between junction and the endpoint at the other end
        const otherEndpoint = startOf(beforeSurface); // junction is at end of before surface
        collinearEndpointsToSkip.add(otherEndpoint.getKey());

        const junctionXY = junction.computeXY();
        const otherXY = otherEndpoint.computeXY();
        const junctionDist = (junctionXY.x - origin.x) ** 2 + (junctionXY.y - origin.y) ** 2;
        const otherDist = (otherXY.x - origin.x) ** 2 + (otherXY.y - origin.y) ** 2;
        const junctionNearerThanEndpoint = junctionDist < otherDist;

        if (shadowOrder > 0) {
          // Far-before-near: endpoint is farther, so endpoint first
          if (junctionNearerThanEndpoint) {
            preComputedPairs.set(otherEndpoint, junction, -1);
          } else {
            preComputedPairs.set(junction, otherEndpoint, -1);
          }
        } else if (shadowOrder < 0) {
          // Near-before-far: junction is nearer, so junction first
          if (junctionNearerThanEndpoint) {
            preComputedPairs.set(junction, otherEndpoint, -1);
          } else {
            preComputedPairs.set(otherEndpoint, junction, -1);
          }
        } else {
          // Default to distance order
          if (junctionNearerThanEndpoint) {
            preComputedPairs.set(junction, otherEndpoint, -1);
          } else {
            preComputedPairs.set(otherEndpoint, junction, -1);
          }
        }
      }

      // Check if after surface is collinear
      const afterOrientation = surfaceOrientations.get(afterSurface.id);
      if (afterOrientation && afterOrientation.crossProduct === 0) {
        // Junction is at one end of a collinear surface
        // Add pair between junction and the endpoint at the other end
        const otherEndpoint = endOf(afterSurface); // junction is at start of after surface
        collinearEndpointsToSkip.add(otherEndpoint.getKey());

        const junctionXY = junction.computeXY();
        const otherXY = otherEndpoint.computeXY();
        const junctionDist = (junctionXY.x - origin.x) ** 2 + (junctionXY.y - origin.y) ** 2;
        const otherDist = (otherXY.x - origin.x) ** 2 + (otherXY.y - origin.y) ** 2;
        const junctionNearerThanEndpoint = junctionDist < otherDist;

        if (shadowOrder > 0) {
          // Far-before-near: endpoint is farther, so endpoint first
          if (junctionNearerThanEndpoint) {
            preComputedPairs.set(otherEndpoint, junction, -1);
          } else {
            preComputedPairs.set(junction, otherEndpoint, -1);
          }
        } else if (shadowOrder < 0) {
          // Near-before-far: junction is nearer, so junction first
          if (junctionNearerThanEndpoint) {
            preComputedPairs.set(junction, otherEndpoint, -1);
          } else {
            preComputedPairs.set(otherEndpoint, junction, -1);
          }
        } else {
          // Default to distance order
          if (junctionNearerThanEndpoint) {
            preComputedPairs.set(junction, otherEndpoint, -1);
          } else {
            preComputedPairs.set(otherEndpoint, junction, -1);
          }
        }
      }
    }
  }

  // Track continuation rays for provenance-based deduplication
  // Each ContinuationRay groups points on the same ray from origin
  const continuationRays: ContinuationRay[] = [];

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
      // Get the junction's surfaces for provenance-based checks
      const beforeSurface = target.getSurfaceBefore();
      const afterSurface = target.getSurfaceAfter();
      const beforeSurfaceId = beforeSurface?.id;
      const afterSurfaceId = afterSurface?.id;

      // Determine if continuation ray should be cast.
      // JunctionPoint.isBlocking() now encapsulates window-aware logic via WindowContext:
      // - For non-window junctions: uses surface orientation logic
      // - For window junctions: uses geometric "between" test
      // This eliminates the need for special-case reversal in the caller.
      const isBlocking = target.isBlocking(surfaceOrientations, windowContext);
      const shouldCastContinuation = !isBlocking;

      // Filter out the junction's own surfaces from obstacles
      // This ensures we only detect BLOCKING by OTHER surfaces
      const obstaclesExcludingJunction = effectiveObstacles.filter(
        (o) => o.id !== beforeSurfaceId && o.id !== afterSurfaceId
      );

      // Cast ray to the junction point, excluding junction's surfaces
      // Note: effectiveObstacles includes ALL surfaces (including screen boundaries)
      const blockingHit = castRayToTarget(
        origin,
        targetXY,
        obstaclesExcludingJunction,
        startLine,
        chains,
        surfaceOrientations,
        windowContext
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
      } else if (isJunctionPoint(blockingHit)) {
        // A blocking junction was hit - check if it's the same as target
        if (blockingHit.equals(target)) {
          reachesJunction = true;
        }
        // Otherwise, a different blocking junction blocks the ray - reachesJunction stays false
      }

      if (reachesJunction) {
        // Ray reaches the junction - add JunctionPoint DIRECTLY using provenance
        // JunctionPoint has exact coordinates from chain definition, no computation needed
        vertices.push(target);

        // If junction allows pass-through (!isBlocking), cast continuation
        if (shouldCastContinuation) {
          // Check if the "after" surface is collinear - if so, handle specially
          const afterOrientation = surfaceOrientations.get(afterSurface.id);
          const isAfterCollinear = afterOrientation?.crossProduct === 0;

          // Also check if "before" surface is collinear
          const beforeOrientation = surfaceOrientations.get(beforeSurface.id);
          const isBeforeCollinear = beforeOrientation?.crossProduct === 0;

          // If one of the surfaces is collinear, we should continue along that surface
          // rather than casting a generic continuation ray
          let contResult: CastRayResult;

          if (isAfterCollinear) {
            // After surface is collinear - continue to its other endpoint
            const otherEndpoint = endOf(afterSurface);
            const otherEndpointCached = endpointCache?.get(otherEndpoint.getKey()) ?? otherEndpoint;
            if (endpointCache && !endpointCache.has(otherEndpoint.getKey())) {
              endpointCache.set(otherEndpoint.getKey(), otherEndpoint);
            }

            // For windowed cones: check if the other endpoint is past the window
            // If not, this collinear surface is BEHIND the window and should be skipped
            const otherXY = otherEndpointCached.computeXY();
            if (isWindowed && startLine && !isPointPastWindow(origin, otherXY, startLine)) {
              // Skip this collinear continuation - it's behind the window
              // Cast a normal continuation ray instead (if applicable)
              contResult = castRay(
                origin,
                target,
                "through",
                effectiveObstacles,
                startLine,
                undefined,
                chains,
                surfaceOrientations,
                windowContext,
                endpointCache
              );
            } else {
              // Mark this endpoint as handled via collinear continuation
              collinearEndpointsToSkip.add(otherEndpointCached.getKey());

              // Check if the other endpoint blocks in the opposite direction
              const junctionStatus = target.getBlockingStatus(surfaceOrientations);
              const otherStatus = otherEndpointCached.getBlockingStatus(surfaceOrientations);

              // Blocking logic per user's model:
              // - If junction is CW blocking, blocked by CCW blocking endpoint
              // - If junction is CCW blocking, blocked by CW blocking endpoint
              const isBlockedByOther =
                (junctionStatus.isCWBlocking && !junctionStatus.isCCWBlocking && otherStatus.isCCWBlocking) ||
                (junctionStatus.isCCWBlocking && !junctionStatus.isCWBlocking && otherStatus.isCWBlocking);

              if (isBlockedByOther) {
                // The collinear surface is blocked at the other end
                // Add just the other endpoint (it becomes the end of this continuation)
                contResult = { hit: otherEndpointCached, passedThroughEndpoints: [] };
              } else {
                // Not blocked - cast through the other endpoint
                contResult = castRay(
                  origin,
                  otherEndpointCached,
                  "through",
                  effectiveObstacles,
                  startLine,
                  undefined,
                  chains,
                  surfaceOrientations,
                  windowContext,
                  endpointCache
                );
                // Add the other endpoint as passed-through
                contResult = {
                  hit: contResult.hit,
                  passedThroughEndpoints: [otherEndpointCached, ...contResult.passedThroughEndpoints],
                };
              }
            }
          } else if (isBeforeCollinear) {
            // Before surface is collinear - continue to its other endpoint (start)
            const otherEndpoint = startOf(beforeSurface);
            const otherEndpointCached = endpointCache?.get(otherEndpoint.getKey()) ?? otherEndpoint;
            if (endpointCache && !endpointCache.has(otherEndpoint.getKey())) {
              endpointCache.set(otherEndpoint.getKey(), otherEndpoint);
            }

            // For windowed cones: check if the other endpoint is past the window
            // If not, this collinear surface is BEHIND the window and should be skipped
            const otherXY = otherEndpointCached.computeXY();
            if (isWindowed && startLine && !isPointPastWindow(origin, otherXY, startLine)) {
              // Skip this collinear continuation - it's behind the window
              // Cast a normal continuation ray instead (if applicable)
              contResult = castRay(
                origin,
                target,
                "through",
                effectiveObstacles,
                startLine,
                undefined,
                chains,
                surfaceOrientations,
                windowContext,
                endpointCache
              );
            } else {
              // Mark this endpoint as handled via collinear continuation
              collinearEndpointsToSkip.add(otherEndpointCached.getKey());

              // Check blocking direction
              const junctionStatus = target.getBlockingStatus(surfaceOrientations);
              const otherStatus = otherEndpointCached.getBlockingStatus(surfaceOrientations);

              const isBlockedByOther =
                (junctionStatus.isCWBlocking && !junctionStatus.isCCWBlocking && otherStatus.isCCWBlocking) ||
                (junctionStatus.isCCWBlocking && !junctionStatus.isCWBlocking && otherStatus.isCWBlocking);

              if (isBlockedByOther) {
                contResult = { hit: otherEndpointCached, passedThroughEndpoints: [] };
              } else {
                contResult = castRay(
                  origin,
                  otherEndpointCached,
                  "through",
                  effectiveObstacles,
                  startLine,
                  undefined,
                  chains,
                  surfaceOrientations,
                  windowContext,
                  endpointCache
                );
                contResult = {
                  hit: contResult.hit,
                  passedThroughEndpoints: [otherEndpointCached, ...contResult.passedThroughEndpoints],
                };
              }
            }
          } else {
            // Neither surface is collinear - normal continuation
            contResult = castRay(
              origin,
              target,
              "through",
              effectiveObstacles,
              startLine,
              undefined, // No window surface for junction continuations
              chains,
              surfaceOrientations,
              windowContext,
              endpointCache
            );
          }

          // Apply range limit to the continuation ray
          // This filters out passed-through endpoints beyond the range limit
          // and replaces the final hit with ArcHitPoint if needed
          // Pass 'target' (junction) as ray source for provenance
          const limitedContResult = applyRangeLimitToContinuation(origin, contResult, rangeLimit, target);

          if (limitedContResult.hit) {
            // Reuse existing HitPoint at same position to ensure consistent PreComputedPairs
            const normalizedContinuation = isHitPoint(limitedContResult.hit)
              ? getOrCreateHitPoint(limitedContResult.hit)
              : limitedContResult.hit;

            // Add passed-through endpoints to vertices (including collinear surface endpoints)
            for (const passedThrough of limitedContResult.passedThroughEndpoints) {
              vertices.push(passedThrough);
            }

            vertices.push(normalizedContinuation);

            // Create ContinuationRay for provenance tracking
            // Now includes passed-through endpoints from the unified castRay
            const contRay = new ContinuationRay(target, limitedContResult.passedThroughEndpoints, normalizedContinuation);
            continuationRays.push(contRay);
            // Assign continuationRay reference to all member points
            target.continuationRay = contRay;
            for (const passedThrough of limitedContResult.passedThroughEndpoints) {
              passedThrough.continuationRay = contRay;
            }
            normalizedContinuation.continuationRay = contRay;

            // Store pairwise orderings for ALL points on this junction continuation ray
            // using the junction's directional blocking status.
            //
            // Shadow boundary order from blocking status:
            // - CCW blocking only → far-before-near (entering shadow in CCW direction)
            // - CW blocking only → near-before-far (exiting shadow in CCW direction)
            const shadowOrder = target.getShadowBoundaryOrder(surfaceOrientations);
            if (shadowOrder !== 0) {
              // Use shadow order from blocking status

              // Collect all points on this ray
              const junctionRayPoints: SourcePoint[] = [
                target,
                ...limitedContResult.passedThroughEndpoints,
                normalizedContinuation,
              ];

              // Sort by distance to determine which point is nearer/farther
              const sortedByDistance = [...junctionRayPoints].sort((a, b) => {
                const aXY = a.computeXY();
                const bXY = b.computeXY();
                const aDist = Math.sqrt((aXY.x - origin.x) ** 2 + (aXY.y - origin.y) ** 2);
                const bDist = Math.sqrt((bXY.x - origin.x) ** 2 + (bXY.y - origin.y) ** 2);
                return aDist - bDist; // near to far
              });

              // Set pairwise orderings based on shadow boundary direction
              for (let i = 0; i < sortedByDistance.length; i++) {
                for (let j = i + 1; j < sortedByDistance.length; j++) {
                  // i is nearer, j is farther
                  if (shadowOrder > 0) {
                    // Continuation first → far before near
                    preComputedPairs.set(sortedByDistance[j]!, sortedByDistance[i]!, -1);
                  } else {
                    // Junction first → near before far
                    preComputedPairs.set(sortedByDistance[i]!, sortedByDistance[j]!, -1);
                  }
                }
              }
            }
          }
        }
        // If junction blocks (isBlocking), we still add the junction but no continuation
      } else if (blockingHit) {
        // Ray is blocked by another obstacle before reaching the junction
        // Add the blocking hit to the polygon (normalize if HitPoint)
        const normalizedHit = isHitPoint(blockingHit) ? getOrCreateHitPoint(blockingHit) : blockingHit;
        vertices.push(normalizedHit);
      }
      continue;
    }

    // Handle ArcIntersectionPoints - where a surface crosses the range limit circle
    // ArcIntersectionPoints are ALWAYS fully blocking (both CW and CCW) - no continuation rays
    // They represent boundaries where visibility transitions from surface to arc
    if (isArcIntersectionPoint(target)) {
      const targetXY = target.computeXY();

      // Cast ray to the intersection point, excluding the intersection's own surface
      const obstaclesExcludingIntersection = effectiveObstacles.filter(
        (o) => o.id !== target.surface.id
      );

      const blockingHit = castRayToTarget(
        origin,
        targetXY,
        obstaclesExcludingIntersection,
        startLine,
        chains,
        surfaceOrientations,
        windowContext
      );

      // Determine if ray reaches the intersection point
      let reachesIntersection = false;
      if (blockingHit === null) {
        // No obstacle blocks - ray reaches the intersection
        reachesIntersection = true;
      } else if (isHitPoint(blockingHit)) {
        // Check if the blocking hit is AT or PAST the target
        const dx = targetXY.x - origin.x;
        const dy = targetXY.y - origin.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq > 0) {
          const scale = 10;
          const targetT = 1 / scale;
          if (blockingHit.t >= targetT) {
            reachesIntersection = true;
          }
        }
      }

      if (reachesIntersection) {
        // Ray reaches the intersection - add it directly
        // ArcIntersectionPoint is fully blocking, no continuation ray
        vertices.push(target);
      } else if (blockingHit) {
        // Ray is blocked by another obstacle before reaching the intersection
        const normalizedHit = isHitPoint(blockingHit) ? getOrCreateHitPoint(blockingHit) : blockingHit;
        vertices.push(normalizedHit);
      }
      continue;
    }

    // Handle ArcJunctionPoints - where two semi-circles of the range limit meet
    // ArcJunctionPoints are ALWAYS fully blocking (both CW and CCW) - no continuation rays
    // They represent the corners of the range limit circle (left/right or top/bottom)
    if (isArcJunctionPoint(target)) {
      const targetXY = target.computeXY();

      // Cast ray to the junction point - no surfaces to exclude
      const blockingHit = castRayToTarget(
        origin,
        targetXY,
        effectiveObstacles,
        startLine,
        chains,
        surfaceOrientations,
        windowContext
      );

      // Determine if ray reaches the arc junction point
      let reachesJunction = false;
      if (blockingHit === null) {
        // No obstacle blocks - ray reaches the junction
        reachesJunction = true;
      } else if (isHitPoint(blockingHit)) {
        // Check if the blocking hit is AT or PAST the target
        const dx = targetXY.x - origin.x;
        const dy = targetXY.y - origin.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq > 0) {
          const scale = 10;
          const targetT = 1 / scale;
          if (blockingHit.t >= targetT) {
            reachesJunction = true;
          }
        }
      }

      if (reachesJunction) {
        // Ray reaches the arc junction - add it directly
        // ArcJunctionPoint is fully blocking, no continuation ray
        vertices.push(target);
      } else if (blockingHit) {
        // Ray is blocked by another obstacle before reaching the junction
        const normalizedHit = isHitPoint(blockingHit) ? getOrCreateHitPoint(blockingHit) : blockingHit;
        vertices.push(normalizedHit);
      }
      continue;
    }

    // Skip endpoints that were already handled as part of a collinear continuation.
    // This prevents duplicate processing and conflicting PreComputedPairs.
    if (collinearEndpointsToSkip.has(target.getKey())) {
      continue;
    }

    // Handle Endpoints - same pattern as non-blocking junctions:
    // 1. Check obstructions BEFORE endpoint (castRay "to" returns Endpoint or blocking HitPoint)
    // 2. Add Endpoint directly (provenance) if not blocked, or blocking HitPoint if blocked
    // 3. Cast continuation ray and pair with Endpoint
    const targetEndpoint = target as Endpoint;
    const castResult = castRay(
      origin,
      targetEndpoint,
      "to",
      effectiveObstacles,
      startLine,
      excludeSurfaceId,
      chains,
      surfaceOrientations,
      windowContext,
      endpointCache
    );

    const rawHit = castResult.hit;
    // Normalize HitPoints to ensure consistent object references for PreComputedPairs
    const hit = rawHit && isHitPoint(rawHit) ? getOrCreateHitPoint(rawHit) : rawHit;

    if (hit) {
      vertices.push(hit);

      // Record PreComputedPairs for passed-through endpoints (blocked case only)
      // When we get blocked before reaching the target, we still need orderings for
      // any passed-through endpoints. If we DO reach the target and cast a continuation
      // ray, the continuation ray section will handle ALL pairwise orderings.
      //
      // Use directional blocking to determine shadow boundary order:
      // - CCW blocking → far-before-near (entering shadow in CCW direction)
      // - CW blocking → near-before-far (exiting shadow in CCW direction)
      if (hit !== targetEndpoint && castResult.passedThroughEndpoints.length > 0) {
        const shadowOrder = targetEndpoint.getShadowBoundaryOrder(surfaceOrientations);

        // Only set pairs if we have a clear shadow direction
        if (shadowOrder !== 0) {
          // Collect all points on this ray
          const blockedRayPoints: SourcePoint[] = [
            hit,
            ...castResult.passedThroughEndpoints,
          ];

          // Sort by distance to determine which point is nearer/farther
          const sortedByDistance = [...blockedRayPoints].sort((a, b) => {
            const aXY = a.computeXY();
            const bXY = b.computeXY();
            const aDist = Math.sqrt((aXY.x - origin.x) ** 2 + (aXY.y - origin.y) ** 2);
            const bDist = Math.sqrt((bXY.x - origin.x) ** 2 + (bXY.y - origin.y) ** 2);
            return aDist - bDist; // near to far
          });

          // Set pairwise orderings based on shadow boundary direction
          for (let i = 0; i < sortedByDistance.length; i++) {
            for (let j = i + 1; j < sortedByDistance.length; j++) {
              // i is nearer, j is farther
              if (shadowOrder > 0) {
                // CCW blocking → far before near
                preComputedPairs.set(sortedByDistance[j]!, sortedByDistance[i]!, -1);
              } else {
                // CW blocking → near before far
                preComputedPairs.set(sortedByDistance[i]!, sortedByDistance[j]!, -1);
              }
            }
          }
        }
      }

      // If we hit the endpoint (not blocked), also cast continuation ray
      // Use isBlocking() for OCP-compliant pattern (unified with junction handling)
      // Endpoints always allow continuation rays (isBlocking() returns false)
      if (isEndpoint(hit) && hit.equals(targetEndpoint) && !hit.isBlocking(surfaceOrientations)) {
        const contResult = castRay(
          origin,
          targetEndpoint,
          "through",
          effectiveObstacles,
          startLine,
          excludeSurfaceId,
          chains,
          surfaceOrientations,
          windowContext,
          endpointCache
        );

        // Apply range limit to the continuation ray
        // This filters out passed-through endpoints beyond the range limit
        // and replaces the final hit with ArcHitPoint if needed
        // Pass 'targetEndpoint' as ray source for provenance
        const limitedContResult = applyRangeLimitToContinuation(origin, contResult, rangeLimit, targetEndpoint);

        if (limitedContResult.hit) {
          // Check if continuation HitPoint already exists (shared by multiple endpoints)
          let normalizedContinuation: SourcePoint;
          let isSharedContinuation = false;

          if (isHitPoint(limitedContResult.hit)) {
            const xy = limitedContResult.hit.computeXY();
            const key = `${xy.x},${xy.y}`;
            isSharedContinuation = hitPointsByPosition.has(key);
            normalizedContinuation = getOrCreateHitPoint(limitedContResult.hit);
          } else {
            normalizedContinuation = limitedContResult.hit;
          }

          vertices.push(normalizedContinuation);

          // Create ContinuationRay for provenance tracking
          // Combine passed-through endpoints from both the "to" cast and the "through" cast
          // Filter castResult passed-through endpoints that exceed range limit
          const filteredCastResultPassedThrough = rangeLimit
            ? castResult.passedThroughEndpoints.filter(
                (ep) => !isPointBeyondRangeLimit(ep.computeXY(), rangeLimit)
              )
            : castResult.passedThroughEndpoints;
          const allPassedThrough = [
            ...filteredCastResultPassedThrough,
            ...limitedContResult.passedThroughEndpoints,
          ];
          const contRay = new ContinuationRay(
            targetEndpoint,
            allPassedThrough,
            normalizedContinuation
          );
          continuationRays.push(contRay);
          // Assign continuationRay reference to all member points
          targetEndpoint.continuationRay = contRay;
          for (const passedThrough of allPassedThrough) {
            passedThrough.continuationRay = contRay;
          }
          normalizedContinuation.continuationRay = contRay;

          // Store pairwise orderings for ALL points on this continuation ray
          // using DIRECTIONAL BLOCKING to determine shadow boundary order.
          //
          // Shadow boundary order from blocking status:
          // - CCW blocking → far-before-near (entering shadow in CCW direction)
          // - CW blocking → near-before-far (exiting shadow in CCW direction)
          // - No blocking (collinear surface) → order = 0 (no shadow direction)
          const shadowOrder = targetEndpoint.getShadowBoundaryOrder(surfaceOrientations);

          // Collect all points on this ray
          const rayPoints: SourcePoint[] = [
            targetEndpoint,
            ...allPassedThrough,
            normalizedContinuation,
          ];

          // Sort by distance to determine which point is nearer/farther
          // (distance establishes relative order, NOT used as tie-breaker)
          const sortedByDistance = [...rayPoints].sort((a, b) => {
            const aXY = a.computeXY();
            const bXY = b.computeXY();
            const aDist = Math.sqrt((aXY.x - origin.x) ** 2 + (aXY.y - origin.y) ** 2);
            const bDist = Math.sqrt((bXY.x - origin.x) ** 2 + (bXY.y - origin.y) ** 2);
            return aDist - bDist; // near to far
          });

          // Set pairwise orderings based on shadow boundary direction
          // If shadowOrder is 0 (collinear surface), fall back to distance order
          const effectiveShadowOrder = shadowOrder !== 0 ? shadowOrder : -1; // default to near-before-far
          for (let i = 0; i < sortedByDistance.length; i++) {
            for (let j = i + 1; j < sortedByDistance.length; j++) {
              // i is nearer, j is farther
              if (effectiveShadowOrder > 0) {
                // CCW blocking → far before near
                preComputedPairs.set(sortedByDistance[j]!, sortedByDistance[i]!, -1);
              } else {
                // CW blocking or collinear → near before far
                preComputedPairs.set(sortedByDistance[i]!, sortedByDistance[j]!, -1);
              }
            }
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
  //
  // ALSO IMPORTANT: If a boundary targets a blocking junction, skip that boundary ray.
  // The ray only touches the adjacent surface at s=1.0, which is skipped by castRayToTarget.
  // This would cause the ray to pass through and hit surfaces beyond (e.g., ceiling).
  let leftHit: SourcePoint | null = null;
  let rightHit: SourcePoint | null = null;

  // Helper to check if a boundary target is a blocking junction
  const isBoundaryTargetBlockingJunction = (boundaryTarget: Vector2): boolean => {
    if (!windowContext) return false;

    // Find if this boundary target is a junction
    for (const chain of chains) {
      for (const jp of chain.getJunctionPoints()) {
        const jpXY = jp.computeXY();
        if (jpXY.x === boundaryTarget.x && jpXY.y === boundaryTarget.y) {
          // Check if this junction is blocking
          return jp.isBlocking(surfaceOrientations, windowContext);
        }
      }
    }
    return false;
  };

  if (!isFullCone(source)) {
    // Use stored blocking status (provenance) - only exclude surfaces that are non-blocking at THIS boundary
    // This ensures each boundary ray only ignores surfaces that light can pass through at its junction
    const leftRayObstacles = effectiveObstacles.filter((o) => !nonBlockingAtLeftBoundary.has(o.id));
    const rightRayObstacles = effectiveObstacles.filter(
      (o) => !nonBlockingAtRightBoundary.has(o.id)
    );

    // Skip left boundary ray if it targets a blocking junction
    // The ray would only touch the adjacent surface at s=1.0, which gets skipped
    const leftTargetsBlockingJunction = isBoundaryTargetBlockingJunction(source.leftBoundary);
    if (!leftTargetsBlockingJunction) {
      const rawLeftHit = castRayToTarget(
        origin,
        source.leftBoundary,
        leftRayObstacles,
        startLine,
        chains,
        surfaceOrientations,
        windowContext
      );
      // Normalize HitPoints to ensure consistent object references
      let normalizedLeftHit = rawLeftHit && isHitPoint(rawLeftHit) ? getOrCreateHitPoint(rawLeftHit) : rawLeftHit;
      // Apply range limit to cone boundary ray - creates ArcHitPoint if hit exceeds range
      // Use leftWindowOrigin as raySource for provenance if available
      if (normalizedLeftHit && rangeLimit) {
        const hitXY = normalizedLeftHit.computeXY();
        if (isPointBeyondRangeLimit(hitXY, rangeLimit)) {
          const limitedPoint = computeRangeLimitIntersection(origin, hitXY, rangeLimit);
          normalizedLeftHit = new ArcHitPoint(limitedPoint, leftWindowOrigin ?? undefined);
        }
      }
      leftHit = normalizedLeftHit;
      if (leftHit) {
        vertices.push(leftHit);
      }
    }

    // Skip right boundary ray if it targets a blocking junction
    const rightTargetsBlockingJunction = isBoundaryTargetBlockingJunction(source.rightBoundary);
    if (!rightTargetsBlockingJunction) {
      const rawRightHit = castRayToTarget(
        origin,
        source.rightBoundary,
        rightRayObstacles,
        startLine,
        chains,
        surfaceOrientations,
        windowContext
      );
      // Normalize HitPoints to ensure consistent object references
      let normalizedRightHit = rawRightHit && isHitPoint(rawRightHit) ? getOrCreateHitPoint(rawRightHit) : rawRightHit;
      // Apply range limit to cone boundary ray - creates ArcHitPoint if hit exceeds range
      // Use rightWindowOrigin as raySource for provenance if available
      if (normalizedRightHit && rangeLimit) {
        const hitXY = normalizedRightHit.computeXY();
        if (isPointBeyondRangeLimit(hitXY, rangeLimit)) {
          const limitedPoint = computeRangeLimitIntersection(origin, hitXY, rangeLimit);
          normalizedRightHit = new ArcHitPoint(limitedPoint, rightWindowOrigin ?? undefined);
        }
      }
      rightHit = normalizedRightHit;
      if (rightHit) {
        vertices.push(rightHit);
      }
    }

    // Pre-compute ALL pairwise orderings for cone boundary points (provenance-based)
    // CCW order for polygon shape: rightWindowOrigin → rightHit → ... → leftHit → leftWindowOrigin
    //
    // Key insight: The polygon closes from leftWindowOrigin back to rightWindowOrigin.
    // So leftHit must come BEFORE leftWindowOrigin to avoid self-intersection.
    // The edge from leftHit → leftWindowOrigin follows the boundary ray back to the window.
    //
    // This avoids floating-point errors in cross product calculations for near-collinear points.
    if (leftWindowOrigin && rightWindowOrigin) {
      // Right boundary: rightWindowOrigin before rightHit
      if (rightHit) {
        preComputedPairs.set(rightWindowOrigin, rightHit, -1);
      }
      // Left boundary: leftHit before leftWindowOrigin (for correct polygon shape)
      if (leftHit) {
        preComputedPairs.set(leftHit, leftWindowOrigin, -1);
      }
      // Cross-boundary: rightWindowOrigin before leftHit
      if (leftHit) {
        preComputedPairs.set(rightWindowOrigin, leftHit, -1);
      }
      // Cross-boundary: rightWindowOrigin before leftWindowOrigin
      preComputedPairs.set(rightWindowOrigin, leftWindowOrigin, -1);
      // Cross-boundary: rightHit before leftHit
      if (rightHit && leftHit) {
        preComputedPairs.set(rightHit, leftHit, -1);
      }
      // Cross-boundary: rightHit before leftWindowOrigin
      if (rightHit) {
        preComputedPairs.set(rightHit, leftWindowOrigin, -1);
      }
    }

    // NOTE: No additional PreComputedPairs needed for cone boundary hits.
    // The reference direction now points OPPOSITE to the window midpoint,
    // so neither left nor right boundary hit is on the reference ray.
    // This eliminates floating-point instability in the oppositeSides check.
  }

  // Filter out vertices beyond the range limit instead of converting them to ArcHitPoints.
  // ArcHitPoints should ONLY be created by applyRangeLimitToContinuation (with provenance).
  // Vertices beyond range are unreachable - they would have been hit by the range limit circle
  // first, and that hit is already captured via continuation rays.
  //
  // Exception: All arc-related points are always kept (they're on the arc by definition).
  const rangeLimitedVertices = rangeLimit
    ? vertices.filter((v) => {
        // Always keep ArcHitPoints (they have proper provenance from continuation rays)
        if (isArcHitPoint(v)) return true;
        // Always keep ArcIntersectionPoints (they're on the arc by definition)
        if (isArcIntersectionPoint(v)) return true;
        // Always keep ArcJunctionPoints (they're on the arc by definition)
        if (isArcJunctionPoint(v)) return true;
        
        // Filter out other vertices beyond range limit
        const xy = v.computeXY();
        const dx = xy.x - rangeLimit.center.x;
        const dy = xy.y - rangeLimit.center.y;
        const distSq = dx * dx + dy * dy;
        const radiusSq = rangeLimit.pair.radius * rangeLimit.pair.radius;
        return distSq <= radiusSq;
      })
    : vertices;

  // Remove duplicate points using equals()
  const uniqueVertices = removeDuplicatesSourcePoint(rangeLimitedVertices);

  // Sort by angle from origin, using pre-computed pairs
  const sorted = sortPolygonVerticesSourcePoint(
    uniqueVertices,
    origin,
    startLine,
    preComputedPairs
  );

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

    // For JunctionPoints, Endpoints, and ArcIntersectionPoints: skip if an OriginPoint exists at same position
    // (OriginPoint from window definition takes precedence - provenance-based dedup)
    // ArcIntersectionPoint is included because it's a surface point (where surface crosses arc)
    if ((isJunctionPoint(p) || isEndpoint(p) || isArcIntersectionPoint(p)) && originPointCoords.has(coordKey)) {
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
 * Sort polygon vertices by direction from origin.
 *
 * Uses PreComputedPairs for pre-calculated ordering, otherwise cross product.
 * Cross product: positive → a first, non-positive → b first.
 */
function sortPolygonVerticesSourcePoint(
  points: SourcePoint[],
  origin: Vector2,
  startLine: Segment | null,
  preComputedPairs: PreComputedPairs
): SourcePoint[] {
  if (points.length === 0) return [];

  // Reference direction for half-plane split (handles > 180° cones)
  // For windowed cones, use the direction OPPOSITE to the window midpoint.
  // This ensures neither left nor right boundary is on the reference ray,
  // eliminating floating-point instability from cone boundary hits.
  let refDirection: Vector2;
  if (startLine !== null) {
    const windowMidX = (startLine.start.x + startLine.end.x) / 2;
    const windowMidY = (startLine.start.y + startLine.end.y) / 2;
    // Direction from origin pointing AWAY from window midpoint
    refDirection = { x: origin.x - windowMidX, y: origin.y - windowMidY };
  } else {
    refDirection = { x: 1, y: 0 };
  }

  // Sort using simplified cross-product comparison with pre-computed pairs
  const sorted = [...points].sort((a, b) =>
    comparePointsCCWSimplified(a, b, origin, refDirection, preComputedPairs)
  );

  // For windowed cones, ensure edge points are at the ends
  if (startLine !== null) {
    return arrangeWindowedConeSimplified(sorted, origin, startLine);
  }

  return sorted;
}

/**
 * Compare two direction vectors using CCW ordering with a reference direction.
 * Returns negative if a comes before b, positive if b comes before a.
 *
 * Uses the same half-plane logic as point sorting to ensure consistency.
 */
function compareDirectionsCCW(a: Vector2, b: Vector2, refDirection: Vector2): number {
  // Cross with reference direction for half-plane handling
  const aRef = refDirection.x * a.y - refDirection.y * a.x;
  const bRef = refDirection.x * b.y - refDirection.y * b.x;

  // Directions on opposite sides of reference
  const oppositeSides = (aRef > 0 && bRef < 0) || (aRef < 0 && bRef > 0);
  if (oppositeSides) {
    return aRef > 0 ? -1 : 1;
  }

  // Same side: use cross product between the two directions
  const crossAB = a.x * b.y - a.y * b.x;
  return crossAB > 0 ? -1 : 1;
}

/**
 * Determine if an adjacent surface should block light.
 *
 * Returns true if adjacentDir is BETWEEN rayDir and windowDir in CCW order.
 * Uses the reference direction to ensure consistent ordering.
 *
 * The adjacent surface blocks light if its direction falls in the angular
 * region between the boundary ray and the window surface.
 */
function shouldAdjacentBlockLight(
  rayDir: Vector2,
  windowDir: Vector2,
  adjacentDir: Vector2,
  refDirection: Vector2
): boolean {
  const cmpRayAdj = compareDirectionsCCW(rayDir, adjacentDir, refDirection);
  const cmpWindowAdj = compareDirectionsCCW(windowDir, adjacentDir, refDirection);

  // Between = after one but not the other (XOR on comparison signs)
  return cmpRayAdj < 0 !== cmpWindowAdj < 0;
}

/**
 * Simplified CCW comparison using pre-computed pairs.
 *
 * Algorithm:
 * 1. Check if pair has a pre-computed order → use it
 * 2. Use reference ray to handle > 180° cones (half-plane split)
 * 3. Cross product for angular comparison: positive → a first, non-positive → b first
 */
function comparePointsCCWSimplified(
  a: SourcePoint,
  b: SourcePoint,
  origin: Vector2,
  refDirection: Vector2,
  preComputedPairs: PreComputedPairs
): number {
  // 1. Check pre-computed pairs first for endpoint/junction pairs on same surface
  // These encode the correct CCW order even when cross product would work
  const preOrder = preComputedPairs.get(a, b);
  if (preOrder !== undefined) return preOrder;

  // 2. Compute vectors from origin
  const aXY = a.computeXY();
  const bXY = b.computeXY();
  const aVec = { x: aXY.x - origin.x, y: aXY.y - origin.y };
  const bVec = { x: bXY.x - origin.x, y: bXY.y - origin.y };

  // 3. Cross with reference direction for half-plane handling
  const aRef = refDirection.x * aVec.y - refDirection.y * aVec.x;
  const bRef = refDirection.x * bVec.y - refDirection.y * bVec.x;

  // Points on opposite sides of reference ray
  const oppositeSides = (aRef > 0 && bRef < 0) || (aRef < 0 && bRef > 0);
  if (oppositeSides) {
    return aRef > 0 ? -1 : 1;
  }

  // 4. Same side: use cross product between the two points
  const cross = aVec.x * bVec.y - aVec.y * bVec.x;

  // Handle collinear points (cross === 0)
  // Per project rules: ALL collinear points MUST have pre-computed order via PreComputedPairs
  // or be handled by provenance. No distance-based fallback is allowed.
  if (cross === 0) {
    // Same position points are equal
    if (aXY.x === bXY.x && aXY.y === bXY.y) {
      return 0;
    }

    // ArcHitPoints represent the boundary of visibility - they should come
    // at their natural position on the arc. When collinear with other points,
    // use provenance: ArcHitPoint is the boundary (outermost visible point).
    // For collinear ArcHitPoint vs other point, ArcHitPoint is always
    // farther from origin (it's at the max range), so it comes AFTER in CCW order
    // for entering shadow, BEFORE for exiting shadow. Since ArcIntersectionPoints
    // and other boundary points are fully blocking, ArcHitPoint comes after.
    if (isArcHitPoint(a) && !isArcHitPoint(b)) {
      return 1; // b comes before a (ArcHitPoint is at the boundary)
    }
    if (isArcHitPoint(b) && !isArcHitPoint(a)) {
      return -1; // a comes before b (ArcHitPoint is at the boundary)
    }

    // ArcJunctionPoints are on opposite sides of the origin (180° apart).
    // Order them by dot product with reference direction:
    // The one more aligned with reference comes first (CCW order).
    if (isArcJunctionPoint(a) && isArcJunctionPoint(b)) {
      const aDot = aVec.x * refDirection.x + aVec.y * refDirection.y;
      const bDot = bVec.x * refDirection.x + bVec.y * refDirection.y;
      // Higher dot product = more aligned with reference = comes first in CCW
      if (aDot !== bDot) {
        return aDot > bDot ? -1 : 1;
      }
      // If dot products are equal (shouldn't happen), use boundary name as tiebreaker
      return a.boundary < b.boundary ? -1 : 1;
    }

    // OriginPoints (window corners) are non-blocking, so they come first
    if (isOriginPoint(a) && !isOriginPoint(b)) {
      return -1; // a (OriginPoint) comes before b
    }
    if (isOriginPoint(b) && !isOriginPoint(a)) {
      return 1; // b (OriginPoint) comes before a
    }

    // HitPoints on DIFFERENT surfaces are UNRELATED collinear points.
    // Per project rules: "Distance ordering is only valid for UNRELATED collinear points."
    // These come from rays to different targets that happen to be collinear.
    // Order by distance: closer to origin comes first in CCW order.
    if (isHitPoint(a) && isHitPoint(b) && a.hitSurface?.id !== b.hitSurface?.id) {
      const aDistSq = aVec.x * aVec.x + aVec.y * aVec.y;
      const bDistSq = bVec.x * bVec.x + bVec.y * bVec.y;
      if (aDistSq !== bDistSq) {
        return aDistSq < bDistSq ? -1 : 1;
      }
      // Same distance (shouldn't happen for different surfaces), use surface ID as tiebreaker
      return (a.hitSurface?.id ?? "") < (b.hitSurface?.id ?? "") ? -1 : 1;
    }

    // For other collinear points without PreComputedPairs: this is a bug
    // All same-ray orderings must be pre-computed based on provenance
    throw new Error(
      `Critical: Collinear points without PreComputedPairs: ` +
        `${a.getKey()} vs ${b.getKey()}. ` +
        `All collinear orderings must be pre-computed. No distance fallback allowed.`
    );
  }

  // Positive cross: a comes before b in CCW (-1)
  // Negative cross: b comes before a (1)
  return cross > 0 ? -1 : 1;
}

/**
 * Arrange points for windowed cone, ensuring edge points are at ends.
 * Simplified version without pairedEndpoint tracking.
 */
function arrangeWindowedConeSimplified(
  sortedPoints: SourcePoint[],
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

  for (const p of sortedPoints) {
    const xy = p.computeXY();
    if (xy.x === leftXY.x && xy.y === leftXY.y) {
      leftEdge.push(p);
    } else if (xy.x === rightXY.x && xy.y === rightXY.y) {
      rightEdge.push(p);
    } else {
      middle.push(p);
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
