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
  type ScreenBoundsConfig,
  createScreenBoundaryChain,
} from "@/trajectory-v2/geometry/ScreenBoundaries";
import {
  Endpoint,
  HitPoint,
  OriginPoint,
  type SourcePoint,
  isEndpoint,
  isHitPoint,
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
  // Positive = end is CCW from start → start comes first in CCW traversal
  // Negative = end is CW from start → end comes first in CCW traversal
  // Zero = collinear, use distance as tiebreaker (closer is first)
  const cross =
    (start.x - origin.x) * (end.y - origin.y) - (start.y - origin.y) * (end.x - origin.x);

  if (cross > 0) {
    // End is CCW from start → start comes first
    return { surface, firstEndpoint: "start", crossProduct: cross };
  } else if (cross < 0) {
    // End is CW from start → end comes first
    return { surface, firstEndpoint: "end", crossProduct: cross };
  } else {
    // Collinear: closer endpoint comes first
    const startDist = Math.hypot(start.x - origin.x, start.y - origin.y);
    const endDist = Math.hypot(end.x - origin.x, end.y - origin.y);
    return {
      surface,
      firstEndpoint: startDist <= endDist ? "start" : "end",
      crossProduct: cross,
    };
  }
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
 * Get the associated surface from an Endpoint or JunctionPoint.
 * For Endpoints: returns the surface directly.
 * For JunctionPoints: returns surfaceBefore (the surface ending at the junction).
 */
function getSurfaceFromPoint(
  pairedEndpoint: Endpoint | JunctionPoint | null,
  point: SourcePoint
): Surface | null {
  if (pairedEndpoint) {
    return isEndpoint(pairedEndpoint) ? pairedEndpoint.surface : pairedEndpoint.getSurfaceBefore();
  }
  if (isEndpoint(point)) {
    return point.surface;
  }
  if (isJunctionPoint(point)) {
    return point.getSurfaceBefore();
  }
  return null;
}

/**
 * Get the endpoint "which" value ("start" or "end") for sorting.
 * For Endpoints: returns which directly.
 * For JunctionPoints: returns "end" (junction is at the END of surfaceBefore).
 */
function getEndpointWhich(
  pairedEndpoint: Endpoint | JunctionPoint | null,
  point: SourcePoint
): "start" | "end" | null {
  if (pairedEndpoint) {
    return isEndpoint(pairedEndpoint) ? pairedEndpoint.which : "end";
  }
  if (isEndpoint(point)) {
    return point.which;
  }
  if (isJunctionPoint(point)) {
    return "end"; // Junction is at the end of surfaceBefore
  }
  return null;
}

/**
 * Unified cross-product comparator for CCW polygon sorting.
 *
 * First Principles:
 * - For any two points A and B, compute: (origin→A) × (origin→B)
 * - cross > 0: A is CCW from B → A comes first in CCW traversal
 * - cross < 0: A is CW from B → B comes first in CCW traversal
 * - cross = 0: Collinear → use surface orientation or distance as tiebreaker
 *
 * This single calculation replaces ALL angle comparisons, ensuring consistency.
 * @param a First point to compare
 * @param b Second point to compare
 * @param origin The cone origin (player position)
 * @param refDirection Reference direction for half-plane split
 * @param surfaceOrientations Pre-computed orientations for surfaces
 * @param continuationToEndpoint Map from continuation key to its paired endpoint
 * @param endpointToContinuation Map from endpoint key to its continuation
 * @returns Negative if a < b, positive if a > b, zero if equal
 */
/**
 * Compare two points for CCW polygon sorting using ray-crossing reversal.
 *
 * ALGORITHM (user-specified):
 * 1. Use the standard cross-product comparison
 * 2. Check if the points are on opposite sides of the reference ray
 * 3. If they are, the comparison "crosses" the ray - use reference position to determine order
 *
 * When points are on OPPOSITE sides of the reference ray:
 * - The cross-product comparison spans more than 180°
 * - This causes the circular ordering problem
 * - Solution: use position relative to reference ray to determine order
 *
 * When points are on the SAME side of the reference ray:
 * - The cross-product comparison spans at most 180°
 * - Cross-product is transitive within this range
 * - Use normal cross-product result
 *
 * This is EPSILON-FREE and uses only cross-product calculations.
 * The cross-product is the SINGLE SOURCE OF TRUTH.
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
  // Due to floating-point precision, mathematically collinear points may have
  // a tiny non-zero cross product. We use a RELATIVE tolerance check:
  // if |aRef| is negligible compared to the product of vector magnitudes,
  // the point is effectively on the reference ray.
  //
  // This is "epsilon-free" in the sense that the tolerance scales with the
  // actual magnitudes involved, not a fixed epsilon constant.
  const refMagSq = refDirection.x * refDirection.x + refDirection.y * refDirection.y;
  const aMagSq = aVec.x * aVec.x + aVec.y * aVec.y;
  const bMagSq = bVec.x * bVec.x + bVec.y * bVec.y;

  // Relative threshold: cross product should be < sqrt(refMagSq * vecMagSq) * 1e-10
  // This means the sine of the angle between vectors is < 1e-10
  const aOnRay = Math.abs(aRef) * Math.abs(aRef) < refMagSq * aMagSq * 1e-20;
  const bOnRay = Math.abs(bRef) * Math.abs(bRef) < refMagSq * bMagSq * 1e-20;

  if (aOnRay && !bOnRay) {
    // A is on reference ray, B is not
    // A comes AFTER all other points → return 1
    return 1;
  }
  if (bOnRay && !aOnRay) {
    // B is on reference ray, A is not
    // A comes before B → return -1
    return -1;
  }
  if (aOnRay && bOnRay) {
    // Both on reference ray - use distance tiebreaker (closer points first)
    if (aMagSq !== bMagSq) {
      return aMagSq - bMagSq;
    }
    // Fall through to collinear handling if distances are equal
  }

  // Check if points are on opposite sides of the reference ray
  // (one positive, one negative - excluding zero for exact ray alignment)
  const oppositeSides = (aRef > 0 && bRef < 0) || (aRef < 0 && bRef > 0);

  if (oppositeSides) {
    // Points on opposite sides: use reference position to determine order
    // In CCW order starting from reference ray:
    // - Points CCW from reference (aRef > 0) come FIRST (0° to 180°)
    // - Points CW from reference (aRef < 0) come SECOND (180° to 360°)
    return aRef > 0 ? -1 : 1;
  }

  // Same side: cross-product is transitive
  const cross = aVec.x * bVec.y - aVec.y * bVec.x;

  if (cross > 0) {
    // A is CCW from B → A comes first in CCW ordering
    return -1;
  }

  if (cross < 0) {
    // A is CW from B → B comes first in CCW ordering
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

  // For collinear points, find the root endpoint of each chain
  // This handles transitive pairing: (endpoint) → (endpoint) → (hitpoint)
  const rootEndpoint1 = findRootEndpoint(p1, a.pairedEndpoint, continuationToEndpoint);
  const rootEndpoint2 = findRootEndpoint(p2, b.pairedEndpoint, continuationToEndpoint);

  // If both are on the same ray (same root endpoint), use shadow boundary order
  const sameRay =
    rootEndpoint1 && rootEndpoint2 && rootEndpoint1.getKey() === rootEndpoint2.getKey();

  if (sameRay || arePaired) {
    // Use shadow boundary order from the root endpoint's orientation
    const rootEndpoint = rootEndpoint1 ?? rootEndpoint2;

    if (rootEndpoint) {
      // Get surface ID for orientation lookup
      // For Endpoints: use surface.id
      // For JunctionPoints: use surfaceBefore.id (the surface ending at the junction)
      const surfaceId = isEndpoint(rootEndpoint)
        ? rootEndpoint.surface.id
        : rootEndpoint.getSurfaceBefore().id;
      const orientation = surfaceOrientations.get(surfaceId);

      if (orientation && isEndpoint(rootEndpoint)) {
        const order = getShadowBoundaryOrderFromOrientation(rootEndpoint, orientation);
        // order > 0: continuation comes BEFORE endpoint (entering shadow)
        // order < 0: continuation comes AFTER endpoint (exiting shadow)

        // Determine which point is closer to origin (the endpoint in the chain)
        const dist1 = Math.hypot(a.xy.x - origin.x, a.xy.y - origin.y);
        const dist2 = Math.hypot(b.xy.x - origin.x, b.xy.y - origin.y);

        if (order > 0) {
          // Continuation before endpoint: further point (larger distance) comes first
          return dist2 - dist1; // Larger distance first
        } else {
          // Continuation after endpoint: closer point (smaller distance) comes first
          return dist1 - dist2; // Smaller distance first
        }
      } else if (isJunctionPoint(rootEndpoint)) {
        // For junctions, order by distance (continuation is further from origin)
        const dist1 = Math.hypot(a.xy.x - origin.x, a.xy.y - origin.y);
        const dist2 = Math.hypot(b.xy.x - origin.x, b.xy.y - origin.y);
        return dist1 - dist2; // Closer first (junction), then continuation
      }
    }
  }

  // Get surface info for both points
  // For Endpoints: use surface directly
  // For JunctionPoints: use surfaceBefore
  const aSurface = getSurfaceFromPoint(a.pairedEndpoint, p1);
  const bSurface = getSurfaceFromPoint(b.pairedEndpoint, p2);

  // Same surface: use orientation to determine order
  if (aSurface && bSurface && aSurface.id === bSurface.id) {
    const orientation = surfaceOrientations.get(aSurface.id);
    if (orientation) {
      // Get which endpoint ("start" or "end") for ordering
      // Endpoints have .which, JunctionPoints are at the "end" of their surfaceBefore
      const aWhich = getEndpointWhich(a.pairedEndpoint, p1);
      const bWhich = getEndpointWhich(b.pairedEndpoint, p2);

      if (aWhich && bWhich) {
        if (aWhich !== bWhich) {
          // Different endpoints of same surface
          const aIsFirst = aWhich === orientation.firstEndpoint;
          return aIsFirst ? -1 : 1;
        } else {
          // Same endpoint group (endpoint vs its continuation)
          // Continuation order depends on entering/exiting
          if (isEndpoint(p1) && !isEndpoint(p2)) {
            const order = getShadowBoundaryOrderFromOrientation(p1, orientation);
            return order > 0 ? 1 : -1; // positive = continuation first
          } else if (!isEndpoint(p1) && isEndpoint(p2)) {
            const order = getShadowBoundaryOrderFromOrientation(p2, orientation);
            return order > 0 ? -1 : 1;
          }
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

  // Use relative tolerance for boundary checks
  // A point on the boundary ray should be considered "in cone"
  const rightVec = { x: right.x - origin.x, y: right.y - origin.y };
  const leftVec = { x: left.x - origin.x, y: left.y - origin.y };
  const pointVec = { x: point.x - origin.x, y: point.y - origin.y };

  // Compute magnitudes for relative tolerance
  const rightMag = Math.sqrt(rightVec.x * rightVec.x + rightVec.y * rightVec.y);
  const leftMag = Math.sqrt(leftVec.x * leftVec.x + leftVec.y * leftVec.y);
  const pointMag = Math.sqrt(pointVec.x * pointVec.x + pointVec.y * pointVec.y);

  // Relative tolerance: if cross product is tiny compared to magnitudes, treat as on-boundary
  const rightTol = rightMag * pointMag * 0.001;
  const leftTol = leftMag * pointMag * 0.001;

  // Treat near-zero crosses as on-boundary (in cone)
  const rightOnBoundary = Math.abs(rightCross) < rightTol;
  const leftOnBoundary = Math.abs(leftCross) < leftTol;

  // Effective check with tolerance
  const rightOK = rightCross >= -rightTol || rightOnBoundary;
  const leftOK = leftCross <= leftTol || leftOnBoundary;

  if (sectorCross >= 0) {
    return rightOK && leftOK;
  }

  return rightOK || leftOK;
}

/**
 * Check if a point is on the far side of the window from the origin.
 *
 * For windowed cones, a point should only be included if it's "past" the window
 * (on the opposite side from the origin). Points between the origin and window
 * that happen to be in the angular range should be excluded.
 *
 * Uses cross-product to determine which side of the window line the point is on.
 * The origin defines one side; points on the opposite side are "past" the window.
 *
 * @param origin The cone origin (player or reflected position)
 * @param point The point to check
 * @param window The window segment (startLine)
 * @returns true if point is on the far side of the window from origin
 */
function isPointPastWindow(origin: Vector2, point: Vector2, window: Segment): boolean {
  // Cross product of (window direction) × (origin relative to window start)
  // This tells us which side of the window line the origin is on
  const windowDx = window.end.x - window.start.x;
  const windowDy = window.end.y - window.start.y;

  const originRelX = origin.x - window.start.x;
  const originRelY = origin.y - window.start.y;
  const originCross = windowDx * originRelY - windowDy * originRelX;

  const pointRelX = point.x - window.start.x;
  const pointRelY = point.y - window.start.y;
  const pointCross = windowDx * pointRelY - windowDy * pointRelX;

  // Point is "past" the window if it's on the opposite side from origin
  // Same sign = same side, opposite sign = opposite sides
  // If either is zero, the point is exactly on the window line
  if (originCross === 0 || pointCross === 0) {
    // Origin or point is on the window line - treat as "past"
    return true;
  }

  // Opposite signs = opposite sides = point is past window
  return (originCross > 0 && pointCross < 0) || (originCross < 0 && pointCross > 0);
}

// =============================================================================
// SURFACE ALIGNMENT DETECTION (EPSILON-FREE)
// =============================================================================

/**
 * Check if two surfaces lie on the same infinite line.
 * This is an EXACT geometric check - no epsilon needed.
 *
 * Two segments are aligned if:
 * 1. Same surface (same ID), OR
 * 2. Both are perfectly vertical (same x-coordinate for all endpoints), OR
 * 3. Both are perfectly horizontal (same y-coordinate for all endpoints), OR
 * 4. They lie on the same non-axis-aligned line (cross product of direction vectors is zero
 *    AND a point from one segment lies on the infinite line of the other)
 */
function areSurfacesAligned(surfaceA: Surface, surfaceB: Surface): boolean {
  // Same surface is trivially aligned
  if (surfaceA.id === surfaceB.id) {
    return true;
  }

  const a1 = surfaceA.segment.start;
  const a2 = surfaceA.segment.end;
  const b1 = surfaceB.segment.start;
  const b2 = surfaceB.segment.end;

  // Check if both are perfectly vertical (all x-coordinates equal)
  if (a1.x === a2.x && b1.x === b2.x && a1.x === b1.x) {
    return true;
  }

  // Check if both are perfectly horizontal (all y-coordinates equal)
  if (a1.y === a2.y && b1.y === b2.y && a1.y === b1.y) {
    return true;
  }

  // For non-axis-aligned lines, check if they're collinear
  // Direction vectors
  const dxA = a2.x - a1.x;
  const dyA = a2.y - a1.y;
  const dxB = b2.x - b1.x;
  const dyB = b2.y - b1.y;

  // Cross product of direction vectors (zero = parallel)
  const dirCross = dxA * dyB - dyA * dxB;
  if (dirCross !== 0) {
    return false; // Not parallel, can't be on same line
  }

  // Parallel - check if b1 lies on the infinite line through a1 and a2
  // Vector from a1 to b1
  const dxAB = b1.x - a1.x;
  const dyAB = b1.y - a1.y;

  // Cross product with direction of A (zero = b1 is on line A)
  const pointCross = dxA * dyAB - dyA * dxAB;
  return pointCross === 0;
}

// =============================================================================
// CORNER DETECTION
// =============================================================================

/**
 * Check if an endpoint lies on another GAME surface (corner detection).
 *
 * This happens when two game surfaces meet at a corner - one endpoint of one surface
 * lies on the other surface's segment.
 *
 * We only check game surfaces, NOT screen boundaries. Endpoints at screen edges
 * should still have continuation rays (which will hit the screen boundary).
 *
 * @returns true if the endpoint lies on another game surface
 */
function isEndpointOnOtherSurface(
  endpoint: Endpoint,
  obstacles: readonly Surface[] // Includes screen boundary surfaces
): boolean {
  const point = endpoint.computeXY();
  const ownSurfaceId = endpoint.surface.id;
  const EPSILON = 0.001; // Small tolerance for floating point

  // Only check game obstacles, NOT screen boundaries
  // Screen boundaries are handled separately - endpoints at screen edges
  // should still have continuation rays
  for (const surface of obstacles) {
    if (surface.id === ownSurfaceId) continue;
    const isOnSegment = isPointOnSegment(
      point,
      surface.segment.start,
      surface.segment.end,
      EPSILON
    );
    const isSharedEndpoint = isPointAtEndpoint(
      point,
      surface.segment.start,
      surface.segment.end,
      EPSILON
    );

    if (isOnSegment || isSharedEndpoint) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a point is at an endpoint of a segment (shared endpoint / joint point).
 */
function isPointAtEndpoint(
  point: Vector2,
  segStart: Vector2,
  segEnd: Vector2,
  epsilon: number
): boolean {
  const distToStart = Math.hypot(point.x - segStart.x, point.y - segStart.y);
  const distToEnd = Math.hypot(point.x - segEnd.x, point.y - segEnd.y);
  return distToStart < epsilon || distToEnd < epsilon;
}

/**
 * Check if a point lies on a line segment (within tolerance).
 */
function isPointOnSegment(
  point: Vector2,
  segStart: Vector2,
  segEnd: Vector2,
  epsilon: number
): boolean {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Degenerate segment (point)
    return Math.abs(point.x - segStart.x) < epsilon && Math.abs(point.y - segStart.y) < epsilon;
  }

  // Project point onto line and get parameter t
  const t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lenSq;

  // Check if t is within segment bounds (STRICTLY interior, not at endpoints)
  // For corner detection, we only care about points that are IN the middle of another segment,
  // not at the endpoints. Two surfaces sharing an endpoint is NOT the same as a corner.
  if (t < epsilon || t > 1 - epsilon) {
    return false;
  }

  // Get closest point on segment
  const closestX = segStart.x + t * dx;
  const closestY = segStart.y + t * dy;

  // Check distance from point to closest point on segment
  const distSq = (point.x - closestX) ** 2 + (point.y - closestY) ** 2;
  return distSq < epsilon * epsilon;
}

// =============================================================================
// RAY CASTING WITH SOURCE POINTS
// =============================================================================

/**
 * Cast a ray to an endpoint target.
 *
 * Returns:
 * - The Endpoint itself if ray reaches it unblocked
 * - A HitPoint if ray is blocked by an obstacle
 * - null if ray misses (shouldn't happen for valid targets)
 */
function castRayToEndpoint(
  origin: Vector2,
  targetEndpoint: Endpoint,
  obstacles: readonly Surface[], // Includes screen boundary surfaces
  startLine: Segment | null,
  windowSurfaceId?: string
): SourcePoint | null {
  const target = targetEndpoint.computeXY();
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const lenSq = dx * dx + dy * dy;

  // Skip if target is at origin (zero-length ray)
  if (lenSq === 0) return null;

  // Create ray
  const scale = 10;
  const rayEnd = { x: origin.x + dx * scale, y: origin.y + dy * scale };
  const ray: Ray = { from: origin, to: rayEnd };

  // Determine minimum t (where the ray starts)
  let minT = 0;

  if (startLine) {
    // PROVENANCE CHECK: If target IS a window endpoint, it definitionally passes through
    // the window. This is an epsilon-free, exact identity check - no floating-point
    // intersection calculation needed.
    if (windowSurfaceId && targetEndpoint.surface.id === windowSurfaceId) {
      // Window endpoint - ray passes through window by definition
      // minT stays 0 - start checking for obstacles from origin
    } else {
      // Standard case: compute intersection with startLine
      const lineHit = lineLineIntersection(origin, rayEnd, startLine.start, startLine.end);
      if (lineHit.valid && lineHit.s >= 0 && lineHit.s <= 1 && lineHit.t > 0) {
        minT = lineHit.t;
      } else {
        return null;
      }
    }
  }

  // Calculate t for the target endpoint
  const targetT = 1 / scale; // Target is at t = 1/scale since we scaled by 10

  // Find if any obstacle blocks the ray before reaching target
  let closestT = targetT;
  let closestSurface: Surface | null = null;
  let closestS = 0;

  // Check game obstacles
  // NOTE: We DO check obstacles for window endpoints too - an obstacle between
  // the reflected origin and the window can block the path to the window endpoint.
  for (const obstacle of obstacles) {
    // Skip the surface that the endpoint belongs to
    if (targetEndpoint.surface.id === obstacle.id) continue;

    const hit = lineLineIntersection(origin, rayEnd, obstacle.segment.start, obstacle.segment.end);
    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      // PROVENANCE CHECK: If the hit point is exactly at the target endpoint's coordinates,
      // this is NOT a blocking hit - they share the same point (shared endpoint between surfaces)
      if (hit.s === 0 || hit.s === 1) {
        const hitX =
          obstacle.segment.start.x + hit.s * (obstacle.segment.end.x - obstacle.segment.start.x);
        const hitY =
          obstacle.segment.start.y + hit.s * (obstacle.segment.end.y - obstacle.segment.start.y);
        const targetXY = targetEndpoint.computeXY();
        if (hitX === targetXY.x && hitY === targetXY.y) {
          // Hit is at the same point as target - not a block
          continue;
        }
      }
      closestT = hit.t;
      closestSurface = obstacle;
      closestS = hit.s;
    }
  }

  // NOTE: Screen boundaries are now included in obstacles (via allSurfaces)
  // No separate screen boundary loop needed

  // If blocked before target, return HitPoint
  if (closestSurface) {
    return new HitPoint(ray, closestSurface, closestT, closestS);
  }

  // Ray reached target - return the Endpoint itself
  return targetEndpoint;
}

/**
 * Check if two points are exactly equal (same coordinates).
 * Uses exact comparison - no epsilon needed.
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
  obstacles: readonly Surface[], // Includes screen boundary surfaces
  startLine: Segment | null
): SourcePoint | null {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return null;

  const scale = 10;
  const rayEnd = { x: origin.x + dx * scale, y: origin.y + dy * scale };
  const ray: Ray = { from: origin, to: rayEnd };

  // Determine minimum t (where the ray starts)
  let minT = 0;

  if (startLine) {
    // PROVENANCE CHECK: If target IS an endpoint of startLine, the ray
    // definitionally passes through the startLine. We need to check for obstacles
    // BETWEEN origin and target, so minT stays 0 (check from origin).
    const targetIsStartLineEndpoint =
      pointsEqual(target, startLine.start) || pointsEqual(target, startLine.end);

    if (targetIsStartLineEndpoint) {
      // Ray passes through startLine endpoint - check obstacles from origin
      // minT stays 0 so we can detect obstacles blocking the path to the window
      minT = 0;
    } else {
      const lineHit = lineLineIntersection(origin, rayEnd, startLine.start, startLine.end);
      if (lineHit.valid && lineHit.s >= 0 && lineHit.s <= 1 && lineHit.t > 0) {
        minT = lineHit.t;
      } else {
        return null;
      }
    }
  }

  // Find closest obstacle hit
  let closestT = Number.POSITIVE_INFINITY;
  let closestSurface: Surface | null = null;
  let closestS = 0;

  // Check game obstacles
  for (const obstacle of obstacles) {
    const hit = lineLineIntersection(origin, rayEnd, obstacle.segment.start, obstacle.segment.end);
    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      closestT = hit.t;
      closestSurface = obstacle;
      closestS = hit.s;
    }
  }

  // NOTE: Screen boundaries are now included in obstacles (via allSurfaces)
  // No separate screen boundary loop needed

  if (closestSurface) {
    return new HitPoint(ray, closestSurface, closestT, closestS);
  }

  return null;
}

/**
 * Cast a ray to find what's beyond an endpoint (continuation hit).
 *
 * Used for shadow boundary detection: after hitting an endpoint,
 * we need to know what obstacle is behind it.
 *
 * The continuation ray passes through the endpoint and finds the next obstacle.
 */
function castContinuationRay(
  origin: Vector2,
  throughEndpoint: Endpoint,
  allObstacles: readonly Surface[], // Includes screen boundary surfaces
  startLine: Segment | null,
  windowSurfaceId?: string,
  additionalExcludeSurfaceId?: string // For junctions: exclude the second surface too
): SourcePoint | null {
  const target = throughEndpoint.computeXY();
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return null;

  const scale = 10;
  const rayEnd = { x: origin.x + dx * scale, y: origin.y + dy * scale };
  const ray: Ray = { from: origin, to: rayEnd };

  // Calculate t for the endpoint (t = distance to endpoint / total ray length)
  // Since rayEnd is at scale * (target - origin), the endpoint is at t = 1/scale
  const endpointT = 1 / scale;

  // Determine minimum t - start looking past the endpoint
  let minT = endpointT;

  if (startLine) {
    // PROVENANCE CHECK: If throughEndpoint IS a window endpoint, it definitionally
    // passes through the window. Skip floating-point intersection calculation.
    if (windowSurfaceId && throughEndpoint.surface.id === windowSurfaceId) {
      // Window endpoint - continuation ray passes through window by definition
      // minT is already set to endpointT - start looking past the endpoint
    } else {
      const lineHit = lineLineIntersection(origin, rayEnd, startLine.start, startLine.end);
      if (lineHit.valid && lineHit.s >= 0 && lineHit.s <= 1 && lineHit.t > 0) {
        minT = Math.max(lineHit.t, endpointT);
      } else {
        return null;
      }
    }
  }

  // Find first obstacle hit past the endpoint
  let closestT = Number.POSITIVE_INFINITY;
  let closestSurface: Surface | null = null;
  let closestS = 0;

  // Check all obstacles (including screen boundaries passed as part of allObstacles)
  for (const obstacle of allObstacles) {
    // Skip the surface that owns this endpoint
    if (obstacle.id === throughEndpoint.surface.id) continue;
    // For junctions: also skip the second surface meeting at the junction
    if (additionalExcludeSurfaceId && obstacle.id === additionalExcludeSurfaceId) continue;

    const hit = lineLineIntersection(origin, rayEnd, obstacle.segment.start, obstacle.segment.end);
    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      closestT = hit.t;
      closestSurface = obstacle;
      closestS = hit.s;
    }
  }

  if (closestSurface) {
    // PROVENANCE CHECK: If the hit is exactly at s=0 or s=1, this is an endpoint hit!
    // Return an Endpoint instead of HitPoint for proper type detection.
    // This enables recursive continuation from endpoints hit via continuation rays.
    if (closestS === 0) {
      return new Endpoint(closestSurface, "start");
    } else if (closestS === 1) {
      return new Endpoint(closestSurface, "end");
    }
    return new HitPoint(ray, closestSurface, closestT, closestS);
  }

  return null;
}

// =============================================================================
// MAIN ALGORITHM
// =============================================================================

/**
 * A ray target can be either an Endpoint (from SourcePoint) or a JunctionPoint (from SurfaceChain).
 * Both have computeXY() and getKey() methods.
 */
type RayTarget = Endpoint | JunctionPoint;

/**
 * Project a cone through obstacles to create a visibility polygon.
 *
 * Returns SourcePoint[] for exact operations, with computeXY() for rendering.
 *
 * @param source - The cone source (origin and optional window)
 * @param chains - All surface chains (game surfaces)
 * @param bounds - Screen boundaries configuration
 * @param excludeSurfaceId - Optional surface ID to exclude (for reflection cones)
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

  // #region agent log
  fetch("http://localhost:7244/ingest/35819445-5c83-4f31-b501-c940886787b5", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "ConeProjectionV2.ts:entry",
      message: "projectConeV2 called",
      data: { origin, isWindowed, startLine, excludeSurfaceId },
      timestamp: Date.now(),
      sessionId: "debug-session",
      hypothesisId: "H1-H5",
    }),
  }).catch(() => {});
  // #endregion

  // Create screen boundary as a closed surface chain
  // Screen corners are JunctionPoints, handled like any other junction
  const screenChain = createScreenBoundaryChain(bounds);

  // Include screen chain in chains for unified handling
  const allChains = [...chains, screenChain];

  // Extract all surfaces from chains for ray-casting (includes screen boundaries)
  const allSurfaces = allChains.flatMap((c) => c.getSurfaces());

  // Filter out excluded surface
  const effectiveObstacles = excludeSurfaceId
    ? allSurfaces.filter((o) => o.id !== excludeSurfaceId)
    : allSurfaces;

  // Pre-calculate surface orientations for all surfaces
  // Used for: endpoint ordering, shadow boundaries, junction ray-pass-through checks
  const surfaceOrientations = new Map<string, SurfaceOrientation>();
  for (const surface of allSurfaces) {
    surfaceOrientations.set(surface.id, computeSurfaceOrientation(surface, origin));
  }

  // Collect all ray targets from chains (including screen chain for corners)
  const rayTargets: RayTarget[] = [];

  for (const chain of allChains) {
    // Add endpoints for open chains
    const endpoints = chain.getEndpoints();
    if (endpoints) {
      rayTargets.push(endpoints[0]); // Chain start endpoint
      rayTargets.push(endpoints[1]); // Chain end endpoint
    }
    // Add junction points (internal joints in chains)
    // For screen chain, these are the 4 corners
    for (const junction of chain.getJunctionPoints()) {
      rayTargets.push(junction);
    }
  }

  // For windowed cones, add window endpoints to polygon ONLY IF NOT OBSTRUCTED.
  // Window endpoints define the cone boundaries, but if an obstacle blocks the ray
  // to a window endpoint, we need to:
  // 1. NOT add the obstructed window endpoint
  // 2. Add the SHADOW BOUNDARY POINT on the window surface (where the obstacle's shadow
  //    starts on the window)
  if (isWindowed && startLine) {
    // Helper to compute shadow boundary point on window
    const computeShadowBoundaryOnWindow = (
      obstructingSurface: Surface
    ): Vector2 | null => {
      // The shadow boundary is cast by one of the obstructing surface's endpoints.
      // Find which endpoint casts the shadow onto the window.
      // Cast ray from origin through each endpoint and find intersection with window.
      for (const which of ["start", "end"] as const) {
        const surfaceEndpoint =
          which === "start"
            ? obstructingSurface.segment.start
            : obstructingSurface.segment.end;

        // Direction from origin to surface endpoint
        const dx = surfaceEndpoint.x - origin.x;
        const dy = surfaceEndpoint.y - origin.y;

        // Find intersection with window surface (startLine)
        // Window is a line from startLine.start to startLine.end
        // Parametric: P = origin + t * (surfaceEndpoint - origin)
        // Window: Q = startLine.start + s * (startLine.end - startLine.start)
        const windowDx = startLine.end.x - startLine.start.x;
        const windowDy = startLine.end.y - startLine.start.y;

        // Solve for t and s
        const denom = dx * windowDy - dy * windowDx;
        if (Math.abs(denom) < 0.0001) continue; // Parallel

        const originToWindowStart = {
          x: startLine.start.x - origin.x,
          y: startLine.start.y - origin.y,
        };

        const t = (originToWindowStart.x * windowDy - originToWindowStart.y * windowDx) / denom;
        const s = (originToWindowStart.x * dy - originToWindowStart.y * dx) / denom;

        // Check if intersection is on the window segment (0 <= s <= 1) and in correct direction (t > 0)
        if (t > 0 && s >= 0 && s <= 1) {
          const intersectionX = origin.x + t * dx;
          const intersectionY = origin.y + t * dy;
          return { x: intersectionX, y: intersectionY };
        }
      }
      return null;
    };

    // Check if startLine.start is obstructed
    const startHit = castRayToTarget(origin, startLine.start, effectiveObstacles, null);
    const startObstructed =
      startHit &&
      isHitPoint(startHit) &&
      Math.hypot(startHit.computeXY().x - origin.x, startHit.computeXY().y - origin.y) <
        Math.hypot(startLine.start.x - origin.x, startLine.start.y - origin.y) - 0.1;

    if (!startObstructed) {
      vertices.push(new OriginPoint(startLine.start));
    } else if (startHit && isHitPoint(startHit)) {
      // Window endpoint is obstructed - compute shadow boundary on window
      const shadowBoundary = computeShadowBoundaryOnWindow(startHit.hitSurface);
      if (shadowBoundary) {
        vertices.push(new OriginPoint(shadowBoundary));
      }
    }

    // Check if startLine.end is obstructed
    const endHit = castRayToTarget(origin, startLine.end, effectiveObstacles, null);
    const endObstructed =
      endHit &&
      isHitPoint(endHit) &&
      Math.hypot(endHit.computeXY().x - origin.x, endHit.computeXY().y - origin.y) <
        Math.hypot(startLine.end.x - origin.x, startLine.end.y - origin.y) - 0.1;

    if (!endObstructed) {
      vertices.push(new OriginPoint(startLine.end));
    } else if (endHit && isHitPoint(endHit)) {
      // Window endpoint is obstructed - compute shadow boundary on window
      const shadowBoundary = computeShadowBoundaryOnWindow(endHit.hitSurface);
      if (shadowBoundary) {
        vertices.push(new OriginPoint(shadowBoundary));
      }
    }
  }

  // Track ray pairs: endpoint + continuation that share the same ray
  // Key: endpoint's unique key, Value: [endpoint, continuation]
  const rayPairs = new Map<
    string,
    { endpoint: Endpoint | JunctionPoint; continuation: SourcePoint | null }
  >();

  // Cast rays to each target within the cone
  for (const target of rayTargets) {
    const targetXY = target.computeXY();

    // Skip if target is at origin
    if (targetXY.x === origin.x && targetXY.y === origin.y) continue;

    // PROVENANCE CHECK: Window endpoints are IN the cone by definition - they ARE the cone boundaries.
    // Skip the floating-point isPointInCone check for ACTUAL window endpoints only.
    // Note: excludeSurfaceId is too broad - it includes all endpoints of the excluded surface.
    // We must check if targetXY matches the actual startLine endpoints.
    const isWindowEndpoint =
      isWindowed &&
      startLine &&
      ((targetXY.x === startLine.start.x && targetXY.y === startLine.start.y) ||
        (targetXY.x === startLine.end.x && targetXY.y === startLine.end.y));

    // Check if target is in cone (skip for window endpoints - they're definitionally in cone)
    if (!isWindowEndpoint && !isPointInCone(targetXY, source)) continue;

    // For windowed cones, verify target is PAST the window (not between origin and window).
    // Points that are angularly within the cone but geometrically between origin and window
    // should be excluded - they create invalid "spikes" in the polygon.
    if (isWindowed && startLine && !isWindowEndpoint) {
      if (!isPointPastWindow(origin, targetXY, startLine)) continue;
    }

    // Handle JunctionPoints (internal joints in chains)
    // JunctionPoints now extend SourcePoint, enabling direct use in vertices and rayPairs
    if (isJunctionPoint(target)) {
      // Cast ray to junction point
      const hit = castRayToTarget(origin, targetXY, effectiveObstacles, startLine);

      // CRITICAL: The hit must be at or beyond the target position
      // If an obstacle blocks the ray BEFORE reaching the target, skip this junction
      if (hit) {
        const hitXY = hit.computeXY();
        const distToHit = Math.hypot(hitXY.x - origin.x, hitXY.y - origin.y);
        const distToTarget = Math.hypot(targetXY.x - origin.x, targetXY.y - origin.y);

        // If hit is closer than target, the junction is blocked - skip it
        if (distToHit < distToTarget - 0.1) {
          // #region agent log
          fetch("http://localhost:7244/ingest/35819445-5c83-4f31-b501-c940886787b5", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "ConeProjectionV2.ts:junctionBlocked",
              message: "Junction blocked by obstacle",
              data: {
                targetXY,
                hitXY,
                distToHit,
                distToTarget,
                hitSurfaceId: isHitPoint(hit) ? hit.hitSurface.id : "n/a",
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              hypothesisId: "H2-H3",
            }),
          }).catch(() => {});
          // #endregion
          continue; // Junction is obstructed, don't add it
        }

        // Add the junction directly to vertices (it's now a SourcePoint)
        vertices.push(target);
        // #region agent log
        fetch("http://localhost:7244/ingest/35819445-5c83-4f31-b501-c940886787b5", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "ConeProjectionV2.ts:junctionAdded",
            message: "Junction added to vertices",
            data: { targetXY, junctionKey: target.getKey() },
            timestamp: Date.now(),
            sessionId: "debug-session",
            hypothesisId: "H1-H3",
          }),
        }).catch(() => {});

        // Screen boundary junctions (corners) don't cast continuation rays
        // Screen edges are boundaries - light doesn't pass through them
        let surfaceBefore: Surface | undefined;
        let surfaceAfter: Surface | undefined;
        try {
          surfaceBefore = target.getSurfaceBefore();
          surfaceAfter = target.getSurfaceAfter();
        } catch {
          // Junction without valid surfaces - skip
          continue;
        }
        const isScreenBoundaryJunction =
          surfaceBefore.id.startsWith("screen-") || surfaceAfter.id.startsWith("screen-");

        if (isScreenBoundaryJunction) {
          // Screen corners are just vertices, no continuation needed
          continue;
        }

        // Use provenance-based pass-through check (no recalculation)
        const canPassThrough = target.canLightPassWithOrientations(surfaceOrientations);

        // For windowed cones, check if this junction is a window endpoint
        // Window endpoints define the cone boundaries - continuations extend OUTSIDE the cone
        const isJunctionWindowEndpoint =
          isWindowed &&
          startLine &&
          ((targetXY.x === startLine.start.x && targetXY.y === startLine.start.y) ||
            (targetXY.x === startLine.end.x && targetXY.y === startLine.end.y));

        // Cast continuation ray if light can pass through and not a window endpoint
        if (canPassThrough && !isJunctionWindowEndpoint) {
          // Create temporary Endpoint for ray casting (provides surfaceId to exclude)
          // Use surfaceBefore's end (which IS the junction position)
          const tempEndpointForRayCast = new Endpoint(surfaceBefore, "end");

          const continuation = castContinuationRay(
            origin,
            tempEndpointForRayCast,
            effectiveObstacles, // Already includes screen boundary surfaces
            startLine,
            undefined, // windowSurfaceId
            surfaceAfter.id // Exclude the second surface at the junction
          );

          if (continuation) {
            const contXY = continuation.computeXY();
            const inCone = isPointInCone(contXY, source);
            const pastWindow = startLine ? isPointPastWindow(origin, contXY, startLine) : true;

            // Only add continuation if within the cone AND past the window (for windowed cones)
            if (!isWindowed || (inCone && pastWindow)) {
              vertices.push(continuation);
              // Track the junction (not the temp endpoint) in rayPairs for proper sorting
              rayPairs.set(target.getKey(), {
                endpoint: target,
                continuation,
              });
            }
          }
        }
      }
      continue;
    }

    // Handle Endpoints (game surfaces) - may need continuation rays
    const targetEndpoint = target as Endpoint;
    const hit = castRayToEndpoint(
      origin,
      targetEndpoint,
      effectiveObstacles, // Already includes screen boundary surfaces
      startLine,
      excludeSurfaceId
    );

    if (hit) {
      vertices.push(hit);

      // If we hit the endpoint (not blocked), also cast continuation ray
      // Continuation captures shadow extensions past obstacle endpoints
      if (isEndpoint(hit) && hit.equals(targetEndpoint)) {
        // Check if this endpoint lies on another surface (corner detection for game surfaces)
        // This is still needed for game surfaces that form corners with each other
        const isAtCorner = isEndpointOnOtherSurface(
          targetEndpoint,
          effectiveObstacles // Already includes screen boundary surfaces
        );

        // For windowed cones, check if this endpoint is a window endpoint
        // Window endpoints define the cone boundaries - continuations from them extend OUTSIDE the cone
        const epXY = targetEndpoint.computeXY();
        const isThisWindowEndpoint =
          isWindowed &&
          startLine &&
          ((epXY.x === startLine.start.x && epXY.y === startLine.start.y) ||
            (epXY.x === startLine.end.x && epXY.y === startLine.end.y));

        if (!isAtCorner && !isThisWindowEndpoint) {
          // Cast continuation ray - may need to recursively continue if it hits another endpoint
          // Skip for window endpoints: their continuations extend outside the cone
          let currentEndpoint = targetEndpoint;
          let previousOnRay: Endpoint = targetEndpoint; // Track for ray pair linking
          const maxIterations = 10; // Prevent infinite loops

          for (let iter = 0; iter < maxIterations; iter++) {
            const continuation = castContinuationRay(
              origin,
              currentEndpoint,
              effectiveObstacles, // Already includes screen boundary surfaces
              startLine,
              excludeSurfaceId
            );

            if (!continuation) break;

            // BUG FIX: Only add continuation if it's within the cone AND past the window (for windowed cones)
            const contXYForCheck = continuation.computeXY();
            const contInCone = isPointInCone(contXYForCheck, source);
            const contPastWindow =
              !startLine || isPointPastWindow(origin, contXYForCheck, startLine);
            const shouldAddCont = !isWindowed || (contInCone && contPastWindow);

            if (shouldAddCont) {
              vertices.push(continuation);

              // Track ray pair for sorting: each endpoint on this ray points to its continuation
              rayPairs.set(previousOnRay.getKey(), { endpoint: previousOnRay, continuation });
            } else {
              // Continuation is outside valid region - stop the chain
              break;
            }

            // If continuation hit another endpoint, we need to continue through it
            if (isEndpoint(continuation)) {
              // Check if this endpoint is at a corner
              const contIsAtCorner = isEndpointOnOtherSurface(
                continuation,
                effectiveObstacles // Already includes screen boundary surfaces
              );
              if (contIsAtCorner) break;

              // Continue from this endpoint - update tracking
              previousOnRay = continuation;
              currentEndpoint = continuation;
            } else {
              // Hit a surface in the middle or screen boundary - done
              break;
            }
          }
        }
      }
    }
  }

  // For windowed cones, cast rays to cone boundaries (extends to screen/obstacles)
  // These rays extend from origin THROUGH the window boundaries to find what's behind.
  // Always cast these rays - even if the window endpoint is obstructed, the hit point
  // will be added and the sorting algorithm will correctly order them.
  if (!isFullCone(source)) {
    const leftHit = castRayToTarget(
      origin,
      source.leftBoundary,
      effectiveObstacles,
      startLine
    );
    if (leftHit) vertices.push(leftHit);

    const rightHit = castRayToTarget(
      origin,
      source.rightBoundary,
      effectiveObstacles,
      startLine
    );
    if (rightHit) vertices.push(rightHit);
  }

  // Remove duplicate points using equals()
  const uniqueVertices = removeDuplicatesSourcePoint(vertices);

  // Sort by angle from origin, using ray pairs for tie-breaking
  // Pass pre-calculated surfaceOrientations to avoid recalculating
  // For windowed cones, pass the pre-computed left/right boundaries for consistent arrangement
  const sorted = sortPolygonVerticesSourcePoint(
    uniqueVertices,
    origin,
    startLine,
    rayPairs,
    surfaceOrientations,
    isWindowed ? source.leftBoundary : undefined,
    isWindowed ? source.rightBoundary : undefined
  );

  // Insert screen corners where the polygon transitions between different screen edges
  const withCorners = insertScreenCorners(sorted, bounds);

  // #region agent log
  fetch("http://localhost:7244/ingest/35819445-5c83-4f31-b501-c940886787b5", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "ConeProjectionV2.ts:exit",
      message: "projectConeV2 returning",
      data: {
        isWindowed,
        vertexCount: withCorners.length,
        vertices: withCorners.map((v) => ({ type: v.type, xy: v.computeXY() })),
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      hypothesisId: "H1-H5",
    }),
  }).catch(() => {});
  // #endregion

  return withCorners;
}

/**
 * Remove duplicate SourcePoints using equals() AND coordinate match.
 * Screen corners are shared between boundaries, so we also dedupe by coordinates.
 */
function removeDuplicatesSourcePoint(points: SourcePoint[]): SourcePoint[] {
  const result: SourcePoint[] = [];
  // Track screen corner coordinates separately - these can be deduplicated
  const seenScreenCornerCoords = new Set<string>();

  for (const p of points) {
    const xy = p.computeXY();

    // Check source equality - always skip exact duplicates
    let isDuplicate = false;
    for (const existing of result) {
      if (p.equals(existing)) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) continue;

    // For all endpoints at the same coordinates, keep only one
    // Two surfaces sharing an endpoint (like at a corner) should produce only one polygon vertex
    const coordKey = `${xy.x},${xy.y}`;
    if (seenScreenCornerCoords.has(coordKey)) continue;
    seenScreenCornerCoords.add(coordKey);

    result.push(p);
  }

  return result;
}

/**
 * Ray pair info tracked during ray casting.
 * Maps endpoint key → { endpoint, continuation }
 */
type RayPairMap = Map<
  string,
  { endpoint: Endpoint | JunctionPoint; continuation: SourcePoint | null }
>;

/**
 * Sort polygon vertices by direction from origin.
 *
 * All rays share the same origin, so sorting is simply by direction angle.
 * For tie-breaking (two points on same ray), we use shadow boundary rules
 * based on source definitions.
 *
 * Shadow boundary rules:
 * - ENTERING shadow (surface extends clockwise): continuation → endpoint
 * - EXITING shadow (surface extends counter-clockwise): endpoint → continuation
 */
function sortPolygonVerticesSourcePoint(
  points: SourcePoint[],
  origin: Vector2,
  startLine: Segment | null,
  rayPairs: RayPairMap,
  surfaceOrientations: Map<string, SurfaceOrientation>,
  leftBoundary?: Vector2,
  rightBoundary?: Vector2
): SourcePoint[] {
  if (points.length === 0) return [];

  // Build a map from continuation point key to its paired endpoint/junction
  const continuationToEndpoint = new Map<string, Endpoint | JunctionPoint>();
  for (const pair of rayPairs.values()) {
    if (pair.continuation) {
      continuationToEndpoint.set(pair.continuation.getKey(), pair.endpoint);
    }
  }

  // SURFACE ORIENTATIONS: Passed in from projectConeV2 (calculated once)
  // This guarantees consistency between:
  // - Endpoint ordering (which endpoint comes first in CCW)
  // - Shadow boundary (whether continuation comes before/after endpoint)
  // - Junction ray-pass-through checks

  // Build sortable point data for each point
  // Note: We no longer use atan2 angles for sorting - the unified cross-product
  // comparator directly computes relative orientation for each pair.
  const pointsWithData = points.map((p) => {
    const xy = p.computeXY();

    // Find paired endpoint/junction if this is a continuation
    // A continuation can be either a HitPoint OR an Endpoint (if it hit another endpoint)
    let pairedEndpoint: Endpoint | JunctionPoint | null = null;
    const pairedEp = continuationToEndpoint.get(p.getKey());
    if (pairedEp) {
      pairedEndpoint = pairedEp;
    }

    return { point: p, xy, pairedEndpoint };
  });

  // Build reverse map: endpoint key → its continuation
  const endpointToContinuation = new Map<string, SourcePoint>();
  for (const pair of rayPairs.values()) {
    if (pair.continuation) {
      endpointToContinuation.set(pair.endpoint.getKey(), pair.continuation);
    }
  }

  // Reference direction for half-plane split.
  // This splits the 360° into two ≤180° half-planes where cross-product is transitive.
  let refDirection: Vector2;
  if (startLine !== null) {
    // Windowed cone: use the "right" boundary (CW-most) as reference.
    // Determine left vs right using cross-product (no atan2!):
    // cross(start - origin, end - origin) > 0 means start is CCW from end,
    // so end is the "right" (CW-most) boundary.
    const startDir = { x: startLine.start.x - origin.x, y: startLine.start.y - origin.y };
    const endDir = { x: startLine.end.x - origin.x, y: startLine.end.y - origin.y };
    const cross = startDir.x * endDir.y - startDir.y * endDir.x;
    // If cross > 0: start is CCW from end → end is "right" (first CW)
    // If cross < 0: end is CCW from start → start is "right" (first CW)
    // If cross == 0: collinear, pick either (use end as default)
    const rightBoundary = cross >= 0 ? startLine.end : startLine.start;
    refDirection = { x: rightBoundary.x - origin.x, y: rightBoundary.y - origin.y };
  } else {
    // Full cone: use positive X direction (1, 0)
    refDirection = { x: 1, y: 0 };
  }

  // Sort using reference-ray based cross-product comparison.
  // This is epsilon-free and guarantees transitivity.
  pointsWithData.sort((a, b) => {
    const result = comparePointsCCW(
      a,
      b,
      origin,
      refDirection,
      surfaceOrientations,
      continuationToEndpoint,
      endpointToContinuation
    );
    return result;
  });

  // For windowed cones, we need a specific ordering:
  // 1. Window surface: right endpoint → left endpoint
  // 2. Left ray continuation: left endpoint → left screen hit
  // 3. Screen boundary: left screen hit → right screen hit
  // 4. Right ray continuation: right screen hit → right endpoint (back to start)
  //
  // This is different from simple CCW angle sorting because the window surface
  // should be first, not the rays.
  if (startLine !== null && leftBoundary && rightBoundary) {
    return arrangeWindowedConeV2(pointsWithData, origin, leftBoundary, rightBoundary);
  }

  return pointsWithData.map((item) => item.point);
}

/**
 * Find the root endpoint/junction of a continuation chain.
 * Follows pairedEndpoint links until reaching the original endpoint or junction.
 */
function findRootEndpoint(
  point: SourcePoint,
  directPairedEndpoint: Endpoint | JunctionPoint | null,
  continuationToEndpoint: Map<string, Endpoint | JunctionPoint>
): Endpoint | JunctionPoint | null {
  // If the point is an endpoint/junction without a paired endpoint, it IS the root
  if ((isEndpoint(point) || isJunctionPoint(point)) && !directPairedEndpoint) {
    return point;
  }

  // Follow the chain to find the root
  let current: Endpoint | JunctionPoint | null = directPairedEndpoint;
  const maxDepth = 10; // Prevent infinite loops

  for (let i = 0; i < maxDepth && current; i++) {
    // Check if current has a paired endpoint (it's also a continuation)
    const nextInChain = continuationToEndpoint.get(current.getKey());
    if (!nextInChain) {
      // current is the root endpoint/junction
      return current;
    }
    current = nextInChain;
  }

  return current;
}

/**
 * Check if two points are a tracked ray pair (endpoint/junction + its continuation).
 * This is an epsilon-free check using source-of-truth ray tracking.
 */
function checkIfPairedPoints(
  p1: SourcePoint,
  p2: SourcePoint,
  continuationToEndpoint: Map<string, Endpoint | JunctionPoint>,
  endpointToContinuation: Map<string, SourcePoint>
): boolean {
  // The authoritative source of pairing is continuationToEndpoint, which maps
  // continuation -> its owning endpoint/junction. Multiple endpoints might point to
  // the same continuation (due to deduplication), but only ONE is the true owner.

  // Case 1: p1 is continuation (HitPoint or Endpoint), check if p2 is its paired endpoint/junction
  const ep1 = continuationToEndpoint.get(p1.getKey());
  if (ep1 && ep1.getKey() === p2.getKey()) {
    return true;
  }

  // Case 2: p2 is continuation, check if p1 is its paired endpoint/junction
  const ep2 = continuationToEndpoint.get(p2.getKey());
  if (ep2 && ep2.getKey() === p1.getKey()) {
    return true;
  }

  return false;
}

/**
 * Compare two points on the same ray using pre-computed surface orientations.
 *
 * This is the UNIFIED comparison that uses orientation as the single source of truth,
 * eliminating floating-point inconsistencies between angle and cross-product calculations.
 */
function compareSameRayPointsWithOrientation(
  a: { point: SourcePoint; xy: Vector2; pairedEndpoint: Endpoint | JunctionPoint | null },
  b: { point: SourcePoint; xy: Vector2; pairedEndpoint: Endpoint | JunctionPoint | null },
  surfaceOrientations: Map<string, SurfaceOrientation>,
  continuationToEndpoint: Map<string, Endpoint | JunctionPoint>
): number {
  const p1 = a.point;
  const p2 = b.point;

  const ep1 = isEndpoint(p1) ? p1 : null;
  const ep2 = isEndpoint(p2) ? p2 : null;

  // Case: p1 is endpoint, p2 is its continuation
  if (ep1 && isHitPoint(p2)) {
    const paired = continuationToEndpoint.get(p2.getKey());
    if (paired?.equals(ep1)) {
      // p2 is continuation of p1 (endpoint)
      // Use orientation-based shadow boundary
      const orientation = surfaceOrientations.get(ep1.surface.id);
      if (orientation) {
        return getShadowBoundaryOrderFromOrientation(ep1, orientation);
      }
    }
  }

  // Case: p2 is endpoint, p1 is its continuation
  if (ep2 && isHitPoint(p1)) {
    const paired = continuationToEndpoint.get(p1.getKey());
    if (paired?.equals(ep2)) {
      // p1 is continuation of p2 (endpoint)
      // Order is opposite of the shadow boundary rule for p2
      const orientation = surfaceOrientations.get(ep2.surface.id);
      if (orientation) {
        return -getShadowBoundaryOrderFromOrientation(ep2, orientation);
      }
    }
  }

  // Default: sort by distance from origin
  const aOriginX = a.xy.x;
  const aOriginY = a.xy.y;
  const bOriginX = b.xy.x;
  const bOriginY = b.xy.y;
  const dist1 = Math.hypot(aOriginX, aOriginY);
  const dist2 = Math.hypot(bOriginX, bOriginY);
  return dist1 - dist2;
}

/**
 * Compare two points on the same ray (same direction from origin).
 *
 * Uses shadow boundary rules based on source definitions:
 * - If one is an endpoint and the other is its continuation, order by shadow boundary
 * - Otherwise, order by distance from origin
 *
 * @deprecated Use compareSameRayPointsWithOrientation instead
 */
function compareSameRayPoints(
  a: { point: SourcePoint; xy: Vector2; pairedEndpoint: Endpoint | JunctionPoint | null },
  b: { point: SourcePoint; xy: Vector2; pairedEndpoint: Endpoint | JunctionPoint | null },
  origin: Vector2,
  continuationToEndpoint: Map<string, Endpoint | JunctionPoint>
): number {
  const p1 = a.point;
  const p2 = b.point;

  const ep1 = isEndpoint(p1) ? p1 : null;
  const ep2 = isEndpoint(p2) ? p2 : null;

  // Case: p1 is endpoint, p2 is its continuation
  if (ep1 && isHitPoint(p2)) {
    const paired = continuationToEndpoint.get(p2.getKey());
    if (paired?.equals(ep1)) {
      // p2 is continuation of p1 (endpoint)
      // Order by shadow boundary rule
      return getShadowBoundaryOrder(ep1, origin);
    }
  }

  // Case: p2 is endpoint, p1 is its continuation
  if (ep2 && isHitPoint(p1)) {
    const paired = continuationToEndpoint.get(p1.getKey());
    if (paired?.equals(ep2)) {
      // p1 is continuation of p2 (endpoint)
      // Order is opposite of the shadow boundary rule for p2
      return -getShadowBoundaryOrder(ep2, origin);
    }
  }

  // Default: sort by distance from origin
  const dist1 = Math.hypot(a.xy.x - origin.x, a.xy.y - origin.y);
  const dist2 = Math.hypot(b.xy.x - origin.x, b.xy.y - origin.y);
  return dist1 - dist2;
}

/**
 * Determine shadow boundary order for an endpoint.
 *
 * Returns > 0 if endpoint should come AFTER its continuation (entering shadow)
 * Returns < 0 if endpoint should come BEFORE its continuation (exiting shadow)
 *
 * Logic: Check where the OTHER endpoint of the surface is relative to this one.
 * - If other is clockwise from this → we're entering the surface's shadow
 * - If other is counter-clockwise → we're exiting the surface's shadow
 */
function getShadowBoundaryOrder(endpoint: Endpoint, origin: Vector2): number {
  const surface = endpoint.surface;
  const thisXY = endpoint.computeXY();
  const otherXY = endpoint.which === "start" ? surface.segment.end : surface.segment.start;

  // Cross product of (origin→this) × (origin→other)
  // Positive = other is counter-clockwise from this
  // Negative = other is clockwise from this
  const cross =
    (thisXY.x - origin.x) * (otherXY.y - origin.y) - (thisXY.y - origin.y) * (otherXY.x - origin.x);

  // Shadow boundary interpretation based on CCW polygon traversal:
  //
  // For a visible surface, light spreads from origin and the surface blocks it.
  // The shadow extends BEYOND each endpoint along the ray from origin.
  // In CCW traversal, we should see: shadow_entry → surface → shadow_exit
  //
  // When other endpoint is COUNTER-CLOCKWISE from this endpoint (positive cross):
  //   - Other endpoint comes BEFORE this one in CCW traversal
  //   - This endpoint is where we EXIT the surface into shadow
  //   - So we're EXITING surface → continuation comes after endpoint → return NEGATIVE
  //   - Wait, that's wrong. Let me reconsider...
  //
  // Actually: the cross product tells us the orientation:
  // - Positive cross: other is CCW from this → when we reach this endpoint,
  //   we're leaving the surface (exiting to shadow) → continuation AFTER endpoint
  // - Negative cross: other is CW from this → when we reach this endpoint,
  //   we're entering the surface (coming from shadow) → continuation BEFORE endpoint
  //
  // So: positive cross → continuation after → positive return (endpoint < continuation)
  //     negative cross → continuation before → negative return (endpoint > continuation)
  //
  // The cross product directly encodes this! Just return cross.
  //
  // Degenerate case: cross = 0 means origin, this endpoint, and other endpoint
  // are collinear (surface aligned with line of sight). Endpoint first.
  if (cross === 0) {
    return -1;
  }

  return cross;
}

/**
 * Arrange points for windowed cone, ensuring edge points are at ends.
 * Uses exact coordinate matching for window endpoints.
 *
 * Handles the ±180° discontinuity: when window endpoints span this boundary,
 * we determine left/right based on the CCW angular direction of the visible cone.
 */
/**
 * Arrange vertices for a windowed cone polygon.
 *
 * For windowed cones, the polygon should be:
 * 1. Right endpoint (CW-most window edge)
 * 2. Left endpoint (CCW-most window edge) - edge along window surface
 * 3. Left continuation (if any) - edge along left ray
 * 4. Screen/middle points - edge along screen boundary
 * 5. Right continuation (if any) - edge back along right ray to start
 */
function arrangeWindowedConeV2(
  sortedPoints: Array<{
    point: SourcePoint;
    xy: Vector2;
    pairedEndpoint: Endpoint | JunctionPoint | null;
  }>,
  origin: Vector2,
  leftBoundary: Vector2,
  rightBoundary: Vector2
): SourcePoint[] {
  // #region agent log
  fetch("http://localhost:7244/ingest/35819445-5c83-4f31-b501-c940886787b5", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "ConeProjectionV2.ts:arrangeWindowedConeV2",
      message: "Arranging windowed cone",
      data: {
        origin,
        leftBoundary,
        rightBoundary,
        sortedPoints: sortedPoints.map((p) => ({
          type: p.point.type,
          xy: p.xy,
          pairedXY: p.pairedEndpoint?.computeXY(),
        })),
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      hypothesisId: "H2-H3",
    }),
  }).catch(() => {});
  // #endregion

  // Helper: check if a point is on the ray from origin through boundary
  // Uses cross product to check collinearity
  // NOTE: For obstructed boundaries, the HitPoint may be BEFORE the boundary (closer to origin)
  function isOnRayFromOrigin(point: Vector2, boundary: Vector2): boolean {
    // Vector from origin to boundary
    const bx = boundary.x - origin.x;
    const by = boundary.y - origin.y;
    // Vector from origin to point
    const px = point.x - origin.x;
    const py = point.y - origin.y;
    // Cross product - should be ~0 for collinear points
    const cross = bx * py - by * px;
    // Check that point is in the same direction as boundary (not opposite)
    const sameDirection = bx * px + by * py > 0; // Dot product > 0 means same direction
    // Tolerance for collinearity (relative to distance)
    const boundaryDist = Math.sqrt(bx * bx + by * by);
    const tolerance = boundaryDist * 0.01; // 1% tolerance
    // Point can be anywhere along the ray (before OR after boundary), just needs to be collinear
    return Math.abs(cross) < tolerance && sameDirection;
  }

  // Separate points into categories
  let rightEndpoint: SourcePoint | null = null;
  let leftEndpoint: SourcePoint | null = null;
  let leftContinuation: SourcePoint | null = null;
  let rightContinuation: SourcePoint | null = null;
  const middlePoints: SourcePoint[] = [];

  for (const item of sortedPoints) {
    // Right window endpoint
    if (item.xy.x === rightBoundary.x && item.xy.y === rightBoundary.y) {
      if (!rightEndpoint) rightEndpoint = item.point;
      continue;
    }
    // Left window endpoint
    if (item.xy.x === leftBoundary.x && item.xy.y === leftBoundary.y) {
      if (!leftEndpoint) leftEndpoint = item.point;
      continue;
    }
    // Continuation of left boundary - check by pairedEndpoint OR by ray direction
    if (item.pairedEndpoint) {
      const pairedXY = item.pairedEndpoint.computeXY();
      if (pairedXY.x === leftBoundary.x && pairedXY.y === leftBoundary.y) {
        if (!leftContinuation) leftContinuation = item.point;
        continue;
      }
      // Continuation of right boundary
      if (pairedXY.x === rightBoundary.x && pairedXY.y === rightBoundary.y) {
        if (!rightContinuation) rightContinuation = item.point;
        continue;
      }
    }
    // Fallback: check if point is on ray from origin through left/right boundary
    // This handles cases where window endpoint is OriginPoint (no pairedEndpoint)
    if (!leftContinuation && isOnRayFromOrigin(item.xy, leftBoundary)) {
      leftContinuation = item.point;
      continue;
    }
    if (!rightContinuation && isOnRayFromOrigin(item.xy, rightBoundary)) {
      rightContinuation = item.point;
      continue;
    }
    // Everything else goes to middle
    middlePoints.push(item.point);
  }

  // Build the polygon in correct order:
  // right_ep → left_ep → left_cont → middle → right_cont → back to right_ep
  const result: SourcePoint[] = [];
  if (rightEndpoint) result.push(rightEndpoint);
  if (leftEndpoint) result.push(leftEndpoint);
  if (leftContinuation) result.push(leftContinuation);

  // Sort middle points for correct polygon traversal from leftCont to rightCont
  // The middle points should follow the screen boundary in CCW order
  // We sort by angular distance from leftContinuation (or leftBoundary if no leftCont)
  if (middlePoints.length > 1) {
    const refPoint = leftContinuation ? leftContinuation.computeXY() : leftBoundary;
    const refVec = { x: refPoint.x - origin.x, y: refPoint.y - origin.y };

    middlePoints.sort((a, b) => {
      const aXY = a.computeXY();
      const bXY = b.computeXY();
      const aVec = { x: aXY.x - origin.x, y: aXY.y - origin.y };
      const bVec = { x: bXY.x - origin.x, y: bXY.y - origin.y };

      // Cross product with reference: positive = CCW from ref
      const aRef = refVec.x * aVec.y - refVec.y * aVec.x;
      const bRef = refVec.x * bVec.y - refVec.y * bVec.x;

      // Sort by signed distance from reference ray
      // Points more CCW from ref should come first (they're closer in CCW direction)
      if (aRef !== bRef) {
        // More negative (CW from ref) = further in CCW traversal = comes later
        return bRef - aRef;
      }

      // Same cross with ref - use distance tiebreaker
      const aDistSq = aVec.x * aVec.x + aVec.y * aVec.y;
      const bDistSq = bVec.x * bVec.x + bVec.y * bVec.y;
      return aDistSq - bDistSq;
    });
  }

  result.push(...middlePoints);
  if (rightContinuation) result.push(rightContinuation);

  // #region agent log
  fetch("http://localhost:7244/ingest/35819445-5c83-4f31-b501-c940886787b5", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "ConeProjectionV2.ts:arrangeWindowedConeV2:result",
      message: "Windowed cone arranged",
      data: {
        hasRightEndpoint: !!rightEndpoint,
        hasLeftEndpoint: !!leftEndpoint,
        hasLeftCont: !!leftContinuation,
        hasRightCont: !!rightContinuation,
        middleCount: middlePoints.length,
        result: result.map((p) => ({ type: p.type, xy: p.computeXY() })),
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      hypothesisId: "H2-H3",
    }),
  }).catch(() => {});
  // #endregion

  return result;
}

/**
 * Insert screen corners between consecutive points on different screen boundaries.
 *
 * When the polygon transitions from one screen edge to another (e.g., floor to right wall),
 * the shared corner must be inserted to create a valid polygon edge along the screen boundary.
 */
function insertScreenCorners(
  points: SourcePoint[],
  screenBounds: ScreenBoundsConfig
): SourcePoint[] {
  if (points.length < 2) return points;

  const result: SourcePoint[] = [];
  const corners = {
    topLeft: { x: screenBounds.minX, y: screenBounds.minY },
    topRight: { x: screenBounds.maxX, y: screenBounds.minY },
    bottomLeft: { x: screenBounds.minX, y: screenBounds.maxY },
    bottomRight: { x: screenBounds.maxX, y: screenBounds.maxY },
  };

  // Determine which screen edge a point is on (null if not on screen boundary)
  function getScreenEdge(xy: Vector2): "top" | "bottom" | "left" | "right" | null {
    const eps = 0.01;
    if (Math.abs(xy.y - screenBounds.minY) < eps) return "top";
    if (Math.abs(xy.y - screenBounds.maxY) < eps) return "bottom";
    if (Math.abs(xy.x - screenBounds.minX) < eps) return "left";
    if (Math.abs(xy.x - screenBounds.maxX) < eps) return "right";
    return null;
  }

  // Get the corner between two edges
  function getCornerBetween(edge1: string, edge2: string): Vector2 | null {
    const pair = [edge1, edge2].sort().join("-");
    switch (pair) {
      case "right-top":
        return corners.topRight;
      case "bottom-right":
        return corners.bottomRight;
      case "bottom-left":
        return corners.bottomLeft;
      case "left-top":
        return corners.topLeft;
      default:
        return null; // Same edge or opposite edges
    }
  }

  for (let i = 0; i < points.length; i++) {
    const current = points[i]!;
    result.push(current);

    const next = points[(i + 1) % points.length]!;
    const currentXY = current.computeXY();
    const nextXY = next.computeXY();

    const currentEdge = getScreenEdge(currentXY);
    const nextEdge = getScreenEdge(nextXY);

    // If both are on different screen edges, insert the corner
    // BUT only if the corner isn't already the next point (screen corners are now JunctionPoints)
    if (currentEdge && nextEdge && currentEdge !== nextEdge) {
      const corner = getCornerBetween(currentEdge, nextEdge);
      if (corner) {
        // Check if the next point IS the corner (screen corners are JunctionPoints)
        const nextIsCorner =
          Math.abs(nextXY.x - corner.x) < 0.01 && Math.abs(nextXY.y - corner.y) < 0.01;

        if (!nextIsCorner) {
          // #region agent log
          fetch("http://localhost:7244/ingest/35819445-5c83-4f31-b501-c940886787b5", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "ConeProjectionV2.ts:insertCorner",
              message: "Inserting screen corner",
              data: { currentEdge, nextEdge, corner },
              timestamp: Date.now(),
              sessionId: "debug-session",
              hypothesisId: "H2",
            }),
          }).catch(() => {});
          // #endregion
          // Create a HitPoint-like corner point
          // Using OriginPoint as a simple coordinate holder
          result.push(new OriginPoint(corner));
        }
      }
    }
  }

  return result;
}

/**
 * Convert SourcePoint[] to Vector2[] for rendering.
 * This is the ONLY place where computeXY() should be called for final output.
 */
export function toVector2Array(points: SourcePoint[]): Vector2[] {
  return points.map((p) => p.computeXY());
}
