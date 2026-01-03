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
  // Track which OriginPoint corresponds to left vs right boundary for PreComputedPairs
  let leftWindowOrigin: OriginPoint | null = null;
  let rightWindowOrigin: OriginPoint | null = null;

  if (isWindowed && startLine) {
    // Determine which window point is left vs right boundary
    // (same logic as createConeThroughWindow)
    const startDir = { x: startLine.start.x - origin.x, y: startLine.start.y - origin.y };
    const endDir = { x: startLine.end.x - origin.x, y: startLine.end.y - origin.y };
    const boundaryCross = startDir.x * endDir.y - startDir.y * endDir.x;

    if (boundaryCross >= 0) {
      // leftBoundary = end, rightBoundary = start
      leftWindowOrigin = new OriginPoint(startLine.end);
      rightWindowOrigin = new OriginPoint(startLine.start);
    } else {
      // leftBoundary = start, rightBoundary = end
      leftWindowOrigin = new OriginPoint(startLine.start);
      rightWindowOrigin = new OriginPoint(startLine.end);
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
  for (const surface of [...obstacles, ...screenChain.getSurfaces()]) {
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
      } else {
        // end comes before start in CCW (non-positive cross)
        preComputedPairs.set(startEndpoint, endEndpoint, 1);
      }
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
      // Check if junction blocks its own ray using isBlocking (OCP pattern)
      // isBlocking() returns true when no continuation ray should be cast
      const shouldCastContinuation = !target.isBlocking(surfaceOrientations);

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

        // If junction allows pass-through (!isBlocking), cast continuation
        if (shouldCastContinuation) {
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

            // Store junction + continuation pair order in PreComputedPairs
            // This is a Type 3 pair: junction + continuation
            // Use "after" surface orientation to determine order:
            // - firstEndpoint === "start" → entering → continuation before junction (1)
            // - firstEndpoint === "end" → exiting → junction before continuation (-1)
            const afterSurface = target.getSurfaceAfter();
            const afterOrientation = surfaceOrientations.get(afterSurface.id);
            if (afterOrientation) {
              const order = afterOrientation.firstEndpoint === "start" ? 1 : -1;
              preComputedPairs.set(target, continuation, order);
            }
          }
        }
        // If junction blocks (isBlocking), we still add the junction but no continuation
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
      // Use isBlocking() for OCP-compliant pattern (unified with junction handling)
      // Endpoints always allow continuation rays (isBlocking() returns false)
      if (isEndpoint(hit) && hit.equals(targetEndpoint) && !hit.isBlocking(surfaceOrientations)) {
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

          // Store endpoint + continuation pair order in PreComputedPairs
          // This is a Type 2 pair: endpoint + continuation
          const orientation = surfaceOrientations.get(targetEndpoint.surface.id);
          if (orientation) {
            const shadowOrder = getShadowBoundaryOrderFromOrientation(
              targetEndpoint,
              orientation
            );
            // shadowOrder > 0: continuation before endpoint → 1
            // shadowOrder < 0: endpoint before continuation → -1
            const order = shadowOrder > 0 ? 1 : -1;
            preComputedPairs.set(targetEndpoint, continuation, order);
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
  let leftHit: SourcePoint | null = null;
  let rightHit: SourcePoint | null = null;

  if (!isFullCone(source)) {
    // Build set of surfaces to exclude (those starting/ending at window endpoints)
    const windowEndpointSurfaces = new Set<string>();
    for (const chain of chains) {
      for (const surface of chain.getSurfaces()) {
        const startKey = `${surface.segment.start.x},${surface.segment.start.y}`;
        const endKey = `${surface.segment.end.x},${surface.segment.end.y}`;
        const leftKey = `${source.leftBoundary.x},${source.leftBoundary.y}`;
        const rightKey = `${source.rightBoundary.x},${source.rightBoundary.y}`;
        if (
          startKey === leftKey ||
          endKey === leftKey ||
          startKey === rightKey ||
          endKey === rightKey
        ) {
          windowEndpointSurfaces.add(surface.id);
        }
      }
    }

    // Filter out surfaces at window endpoints
    const obstaclesExcludingWindowEndpoints = effectiveObstacles.filter(
      (o) => !windowEndpointSurfaces.has(o.id)
    );

    leftHit = castRayToTarget(
      origin,
      source.leftBoundary,
      obstaclesExcludingWindowEndpoints,
      screenBoundaries,
      startLine
    );
    if (leftHit) {
      vertices.push(leftHit);
    }

    rightHit = castRayToTarget(
      origin,
      source.rightBoundary,
      obstaclesExcludingWindowEndpoints,
      screenBoundaries,
      startLine
    );
    if (rightHit) {
      vertices.push(rightHit);
    }

    // Pre-compute ALL pairwise orderings for cone boundary points (provenance-based)
    // CCW order: rightWindowOrigin → rightHit → leftHit → leftWindowOrigin
    // This avoids floating-point errors in cross product calculations
    if (leftWindowOrigin && rightWindowOrigin) {
      // Right boundary: rightWindowOrigin before rightHit
      if (rightHit) {
        preComputedPairs.set(rightWindowOrigin, rightHit, -1);
      }
      // Left boundary: leftHit before leftWindowOrigin
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

  // Remove duplicate points using equals()
  const uniqueVertices = removeDuplicatesSourcePoint(vertices);

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
  // Positive cross: a comes before b in CCW (-1)
  // Non-positive cross: b comes before a (1)
  const cross = aVec.x * bVec.y - aVec.y * bVec.x;
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
