/**
 * HighlightMode - Calculate reaching cones for surface highlighting
 *
 * Computes which portions of the current light reach a target surface,
 * accounting for obstructions that may split the light into multiple sub-cones.
 *
 * All geometry is source-of-truth based:
 * - No epsilon comparisons
 * - No angle calculations (atan2)
 * - Cross-product for all angular comparisons
 * - Provenance-based vertex derivation
 */

import type { Surface } from "@/surfaces/Surface";
import { lineLineIntersection } from "@/trajectory-v2/geometry/GeometryOps";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Segment } from "./WindowConfig";

// =============================================================================
// TYPES
// =============================================================================

/**
 * A cone of light that reaches a target surface.
 *
 * Shape depends on context:
 * - Triangle (3 vertices): Full visibility from origin
 * - Quadrilateral (4 vertices): Windowed visibility through startLine
 */
export interface ReachingCone {
  /** Polygon vertices defining the cone outline */
  readonly vertices: readonly Vector2[];
  /** The light source origin */
  readonly origin: Vector2;
  /** The surface this cone reaches */
  readonly targetSurface: Surface;
}

/**
 * Configuration for calculating reaching cones.
 */
export interface ReachingConeConfig {
  /** Light source origin (player or reflected image) */
  readonly origin: Vector2;
  /** Target surface to check light reaching */
  readonly targetSurface: Surface;
  /** Obstacles that may block light */
  readonly obstacles: readonly Surface[];
  /** Optional window line (umbrella or planned surface) */
  readonly startLine: Segment | null;
}

// =============================================================================
// CROSS-PRODUCT GEOMETRY (No Angles, No Epsilons)
// =============================================================================

/**
 * Cross product of vectors (origin→a) and (origin→b).
 *
 * Result interpretation:
 * - Positive: b is counter-clockwise (left) of a
 * - Negative: b is clockwise (right) of a
 * - Zero: collinear
 */
function crossProduct(origin: Vector2, a: Vector2, b: Vector2): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

/**
 * Check if a point is inside a cone defined by origin and two boundary rays.
 *
 * Uses ONLY cross-product comparisons - no angles, no epsilons.
 *
 * The cone is the angular region between the left and right boundary rays.
 * A point is inside if it's counterclockwise from left (or on left)
 * AND clockwise from right (or on right).
 *
 * Cross-product interpretation:
 * - crossProduct(O, A, B) > 0: B is counterclockwise from A
 * - crossProduct(O, A, B) < 0: B is clockwise from A
 * - crossProduct(O, A, B) = 0: A and B are collinear
 *
 * @param origin Cone apex
 * @param left Left boundary point (defines left edge ray)
 * @param right Right boundary point (defines right edge ray)
 * @param point Point to test
 * @returns true if point is inside or on the cone boundary
 */
export function isPointInConeExact(
  origin: Vector2,
  left: Vector2,
  right: Vector2,
  point: Vector2
): boolean {
  // Cross products determine relative position
  const crossLeft = crossProduct(origin, left, point);
  const crossRight = crossProduct(origin, right, point);

  // Point must be:
  // - Counterclockwise from (or on) left boundary: crossLeft >= 0
  // - Clockwise from (or on) right boundary: crossRight <= 0

  // Check cone span using cross-product of left and right
  // coneSpan > 0: right is CCW from left → cone is "short" sweep → less than 180°
  // coneSpan < 0: right is CW from left → cone is "long" sweep → more than 180°
  const coneSpan = crossProduct(origin, left, right);

  if (coneSpan > 0) {
    // Cone is less than 180° (right is CCW from left) - both conditions required
    return crossLeft >= 0 && crossRight <= 0;
  }

  // Cone spans 180° or more - point is inside if either condition holds
  return crossLeft >= 0 || crossRight <= 0;
}

/**
 * Check if an obstacle segment intersects a cone.
 *
 * Uses cross-product geometry - no angles, no epsilons.
 *
 * An obstacle intersects if:
 * 1. At least one endpoint is inside the cone, OR
 * 2. The segment crosses a cone boundary ray
 *
 * Also checks that the obstacle is "in front" of the origin (between origin and target).
 *
 * @param origin Cone apex
 * @param left Left boundary of cone (target surface start)
 * @param right Right boundary of cone (target surface end)
 * @param obstacle The obstacle surface to test
 * @returns true if obstacle intersects the cone
 */
export function doesObstacleIntersectCone(
  origin: Vector2,
  left: Vector2,
  right: Vector2,
  obstacle: Surface
): boolean {
  const obsStart = obstacle.segment.start;
  const obsEnd = obstacle.segment.end;

  // Check if obstacle is "in front" of origin (not behind)
  // An obstacle is in front if at least one endpoint is closer to target than origin
  // We use cross-product with the "forward" direction (average of left and right)
  // Actually, simpler: check if obstacle intersects the rays from origin to left/right

  // Check if either endpoint is inside the cone
  const startInCone = isPointInConeExact(origin, left, right, obsStart);
  const endInCone = isPointInConeExact(origin, left, right, obsEnd);

  if (startInCone || endInCone) {
    // Also verify the obstacle is between origin and target (not behind origin)
    // Check if obstacle is on the "forward" side of origin
    const leftDir = { x: left.x - origin.x, y: left.y - origin.y };
    const rightDir = { x: right.x - origin.x, y: right.y - origin.y };
    const obsStartDir = { x: obsStart.x - origin.x, y: obsStart.y - origin.y };
    const obsEndDir = { x: obsEnd.x - origin.x, y: obsEnd.y - origin.y };

    // Obstacle is in front if its distance along the forward direction is positive
    // Use dot product with average direction
    const avgDir = { x: (leftDir.x + rightDir.x) / 2, y: (leftDir.y + rightDir.y) / 2 };
    const startDot = obsStartDir.x * avgDir.x + obsStartDir.y * avgDir.y;
    const endDot = obsEndDir.x * avgDir.x + obsEndDir.y * avgDir.y;

    // At least one endpoint should be in front (positive dot product)
    if (startDot > 0 || endDot > 0) {
      return true;
    }
  }

  // Check if segment crosses a cone boundary ray
  // This catches cases where the segment spans the entire cone width

  // Ray from origin through left boundary
  const rayScale = 1000;
  const leftRayEnd = {
    x: origin.x + (left.x - origin.x) * rayScale,
    y: origin.y + (left.y - origin.y) * rayScale,
  };
  const rightRayEnd = {
    x: origin.x + (right.x - origin.x) * rayScale,
    y: origin.y + (right.y - origin.y) * rayScale,
  };

  // Check intersection with left ray
  const leftHit = lineLineIntersection(origin, leftRayEnd, obsStart, obsEnd);
  if (leftHit.valid && leftHit.t > 0 && leftHit.s >= 0 && leftHit.s <= 1) {
    // Check if intersection is before the target (t < 1 where target is at t=1)
    const targetT = 1 / rayScale;
    if (leftHit.t < targetT) {
      return true;
    }
  }

  // Check intersection with right ray
  const rightHit = lineLineIntersection(origin, rightRayEnd, obsStart, obsEnd);
  if (rightHit.valid && rightHit.t > 0 && rightHit.s >= 0 && rightHit.s <= 1) {
    const targetT = 1 / rayScale;
    if (rightHit.t < targetT) {
      return true;
    }
  }

  return false;
}

/**
 * Check if an obstacle fully blocks the cone (complete occlusion).
 *
 * An obstacle fully blocks if it covers the entire angular width of the cone
 * and is positioned between origin and target.
 */
function doesObstacleFullyBlockCone(
  origin: Vector2,
  left: Vector2,
  right: Vector2,
  obstacle: Surface
): boolean {
  const obsStart = obstacle.segment.start;
  const obsEnd = obstacle.segment.end;

  // For full blocking, both cone boundaries must intersect the obstacle
  const rayScale = 1000;
  const leftRayEnd = {
    x: origin.x + (left.x - origin.x) * rayScale,
    y: origin.y + (left.y - origin.y) * rayScale,
  };
  const rightRayEnd = {
    x: origin.x + (right.x - origin.x) * rayScale,
    y: origin.y + (right.y - origin.y) * rayScale,
  };

  const leftHit = lineLineIntersection(origin, leftRayEnd, obsStart, obsEnd);
  const rightHit = lineLineIntersection(origin, rightRayEnd, obsStart, obsEnd);

  // Both rays must hit the obstacle, and the hits must be before the target
  if (!leftHit.valid || !rightHit.valid) return false;
  if (leftHit.t <= 0 || rightHit.t <= 0) return false;
  if (leftHit.s < 0 || leftHit.s > 1 || rightHit.s < 0 || rightHit.s > 1) return false;

  // Check if obstacle is closer than target
  // We compare t values - obstacle hit should be closer than target
  // Target is at t = 1/rayScale (since we scaled the ray)
  const leftTargetT =
    Math.sqrt((left.x - origin.x) ** 2 + (left.y - origin.y) ** 2) /
    Math.sqrt((leftRayEnd.x - origin.x) ** 2 + (leftRayEnd.y - origin.y) ** 2);
  const rightTargetT =
    Math.sqrt((right.x - origin.x) ** 2 + (right.y - origin.y) ** 2) /
    Math.sqrt((rightRayEnd.x - origin.x) ** 2 + (rightRayEnd.y - origin.y) ** 2);

  return leftHit.t < leftTargetT && rightHit.t < rightTargetT;
}

// =============================================================================
// CONE SPLITTING
// =============================================================================

/**
 * Represents an angular shadow cast by an obstacle.
 * Angular position is measured by cross-product with the left cone boundary.
 */
interface AngularShadow {
  /** Shadow start (angularly closer to left boundary, higher cross product) */
  leftPoint: Vector2;
  leftCross: number;
  /** Shadow end (angularly closer to right boundary, lower cross product) */
  rightPoint: Vector2;
  rightCross: number;
}

/**
 * Split a cone by obstacles, returning the unblocked sub-cones.
 *
 * Algorithm (all cross-product based, no angles):
 * 1. Find obstacles that block the cone
 * 2. For each, compute its angular shadow (cross-product bounds)
 * 3. Sort shadows by their left edge
 * 4. Sweep and merge overlapping shadows
 * 5. Return gaps between merged shadows
 */
function splitConeByObstacles(
  origin: Vector2,
  left: Vector2,
  right: Vector2,
  obstacles: readonly Surface[],
  targetSurface: Surface
): Array<{ left: Vector2; right: Vector2 }> {
  // Find obstacles that intersect the cone and are between origin and target
  const blockingObstacles: Surface[] = [];

  for (const obs of obstacles) {
    // Skip the target surface itself
    if (obs.id === targetSurface.id) continue;

    if (doesObstacleIntersectCone(origin, left, right, obs)) {
      // Verify obstacle is between origin and target
      const obsCenter = {
        x: (obs.segment.start.x + obs.segment.end.x) / 2,
        y: (obs.segment.start.y + obs.segment.end.y) / 2,
      };
      const targetCenter = {
        x: (targetSurface.segment.start.x + targetSurface.segment.end.x) / 2,
        y: (targetSurface.segment.start.y + targetSurface.segment.end.y) / 2,
      };

      const obsDistSq = (obsCenter.x - origin.x) ** 2 + (obsCenter.y - origin.y) ** 2;
      const targetDistSq = (targetCenter.x - origin.x) ** 2 + (targetCenter.y - origin.y) ** 2;

      if (obsDistSq < targetDistSq) {
        blockingObstacles.push(obs);
      }
    }
  }

  // If no obstacles, return the full cone
  if (blockingObstacles.length === 0) {
    return [{ left, right }];
  }

  // Check for full occlusion
  for (const obs of blockingObstacles) {
    if (doesObstacleFullyBlockCone(origin, left, right, obs)) {
      return []; // Fully blocked
    }
  }

  // Compute angular shadows for each obstacle
  // Cross-product with left boundary gives angular position:
  // - Higher cross = closer to left boundary (first in sweep)
  // - Lower cross = closer to right boundary (later in sweep)
  const shadows: AngularShadow[] = [];

  for (const obs of blockingObstacles) {
    const start = obs.segment.start;
    const end = obs.segment.end;
    const startCross = crossProduct(origin, left, start);
    const endCross = crossProduct(origin, left, end);

    // Determine which endpoint is the "left" (higher cross) of the shadow
    if (startCross >= endCross) {
      shadows.push({
        leftPoint: start,
        leftCross: startCross,
        rightPoint: end,
        rightCross: endCross,
      });
    } else {
      shadows.push({
        leftPoint: end,
        leftCross: endCross,
        rightPoint: start,
        rightCross: startCross,
      });
    }
  }

  // Sort shadows by their left edge (higher cross first = closer to left boundary)
  shadows.sort((a, b) => b.leftCross - a.leftCross);

  // Sweep and find gaps between shadows
  // Higher cross = closer to left boundary, lower cross = closer to right boundary
  const gaps: Array<{ left: Vector2; right: Vector2 }> = [];

  // Track the current merged shadow region
  let currentShadowEnd: Vector2 | null = null;
  let currentShadowEndCross = Number.POSITIVE_INFINITY;

  for (const shadow of shadows) {
    if (currentShadowEnd === null) {
      // First shadow - create gap from left boundary to this shadow's start
      gaps.push({ left, right: shadow.leftPoint });
      currentShadowEnd = shadow.rightPoint;
      currentShadowEndCross = shadow.rightCross;
    } else if (shadow.leftCross <= currentShadowEndCross) {
      // This shadow starts after current shadow ends - there's a gap!
      gaps.push({ left: currentShadowEnd, right: shadow.leftPoint });
      // Start a new shadow region
      currentShadowEnd = shadow.rightPoint;
      currentShadowEndCross = shadow.rightCross;
    } else {
      // This shadow overlaps with current - extend if it goes further right
      if (shadow.rightCross < currentShadowEndCross) {
        currentShadowEnd = shadow.rightPoint;
        currentShadowEndCross = shadow.rightCross;
      }
    }
  }

  // Final gap from last shadow end to cone's right boundary
  if (currentShadowEnd !== null) {
    gaps.push({ left: currentShadowEnd, right });
  } else {
    // No shadows at all - return full cone
    return [{ left, right }];
  }

  return gaps;
}

// =============================================================================
// MAIN CALCULATION
// =============================================================================

/**
 * Calculate the reaching cones for a target surface.
 *
 * Returns an array of cones representing the portions of light that
 * reach the target surface from the given origin.
 *
 * @param config Configuration with origin, target, obstacles, and optional window
 * @returns Array of reaching cones (may be empty if fully blocked)
 */
export function calculateReachingCones(config: ReachingConeConfig): ReachingCone[] {
  const { origin, targetSurface, obstacles, startLine } = config;

  const surfStart = targetSurface.segment.start;
  const surfEnd = targetSurface.segment.end;

  // Calculate visible intervals on the surface using 1D approach
  const visibleIntervals = calculateVisibleIntervals(origin, targetSurface, obstacles);

  // Convert each visible interval to a ReachingCone
  const result: ReachingCone[] = [];

  for (const interval of visibleIntervals) {
    // Convert interval t values to surface points
    const leftPoint = interpolateSurface(surfStart, surfEnd, interval.start);
    const rightPoint = interpolateSurface(surfStart, surfEnd, interval.end);

    let vertices: Vector2[];

    if (startLine === null) {
      // Triangle: origin, left surface point, right surface point
      vertices = [origin, leftPoint, rightPoint];
    } else {
      // Quadrilateral: truncated by startLine
      const leftIntersection = findRayStartLineIntersection(origin, leftPoint, startLine);
      const rightIntersection = findRayStartLineIntersection(origin, rightPoint, startLine);

      if (leftIntersection && rightIntersection) {
        vertices = [leftIntersection, leftPoint, rightPoint, rightIntersection];
      } else {
        vertices = [origin, leftPoint, rightPoint];
      }
    }

    result.push({
      vertices,
      origin,
      targetSurface,
    });
  }

  return result;
}

/**
 * Calculate reaching cones using provenance from the visibility polygon.
 *
 * This is the preferred approach as it reuses the already-calculated
 * visibility polygon instead of recalculating obstacle blocking.
 *
 * @param origin Light source origin
 * @param targetSurface Surface to find reaching cones for
 * @param visibleSurfacePoints Points on the surface from visibility polygon (via provenance)
 * @param startLine Optional window line
 * @returns Array of reaching cones
 */
/**
 * Convert visible surface segments directly to reaching cones.
 *
 * This is the UNIFIED approach: takes segments from getVisibleSurfaceSegments()
 * and converts each segment to a cone polygon.
 *
 * @param origin Light source origin (player or reflected image)
 * @param targetSurface The surface being highlighted
 * @param segments Visible segments on the surface (from getVisibleSurfaceSegments)
 * @param startLine Optional window line (for quadrilateral cones)
 */
export function segmentsToCones(
  origin: Vector2,
  targetSurface: Surface,
  segments: readonly Segment[],
  startLine: Segment | null
): ReachingCone[] {
  const result: ReachingCone[] = [];

  for (const segment of segments) {
    let vertices: Vector2[];

    if (startLine === null) {
      // Triangle: origin + segment endpoints
      vertices = [origin, segment.start, segment.end];
    } else {
      // Quadrilateral: intersect rays with startLine
      const leftIntersection = findRayStartLineIntersection(origin, segment.start, startLine);
      const rightIntersection = findRayStartLineIntersection(origin, segment.end, startLine);

      if (leftIntersection && rightIntersection) {
        vertices = [leftIntersection, segment.start, segment.end, rightIntersection];
      } else {
        // Fallback to triangle
        vertices = [origin, segment.start, segment.end];
      }
    }

    result.push({
      vertices,
      origin,
      targetSurface,
    });
  }

  return result;
}

/**
 * @deprecated Use segmentsToCones() with getVisibleSurfaceSegments() instead.
 * Kept for backwards compatibility during transition.
 */
export function calculateReachingConesFromProvenance(
  origin: Vector2,
  targetSurface: Surface,
  visibleSurfacePoints: readonly Vector2[],
  startLine: Segment | null
): ReachingCone[] {
  if (visibleSurfacePoints.length < 2) {
    return [];
  }

  // The visible points define the visible portion(s) of the surface
  // Sort them along the surface to find contiguous segments
  const surfStart = targetSurface.segment.start;
  const surfEnd = targetSurface.segment.end;

  // Calculate t parameter for each point
  const pointsWithT = visibleSurfacePoints.map((p) => ({
    point: p,
    t: projectPointToSurfaceT(p, surfStart, surfEnd),
  }));

  // Sort by t
  pointsWithT.sort((a, b) => a.t - b.t);

  // Points come from getVisibleSurfacePoints which already merges consecutive
  // runs of points on the same surface into just their extremes.
  // 
  // So if we have:
  // - 2 points: 1 visible segment
  // - 4 points: 2 visible segments (separated by obstruction)
  // - 6 points: 3 visible segments, etc.
  //
  // Strategy: pair consecutive points (0-1, 2-3, 4-5, etc.)
  
  const segments: Array<{ startT: number; endT: number }> = [];
  
  for (let i = 0; i < pointsWithT.length; i += 2) {
    if (i + 1 < pointsWithT.length) {
      const startT = pointsWithT[i]!.t;
      const endT = pointsWithT[i + 1]!.t;
      
      // Skip degenerate segments
      if (endT > startT) {
        segments.push({ startT, endT });
      }
    }
  }

  // Convert segments to ReachingCones
  const result: ReachingCone[] = [];

  for (const seg of segments) {
    // Skip degenerate segments
    if (seg.endT <= seg.startT) {
      continue;
    }

    const leftPoint = interpolateSurface(surfStart, surfEnd, seg.startT);
    const rightPoint = interpolateSurface(surfStart, surfEnd, seg.endT);

    let vertices: Vector2[];

    if (startLine === null) {
      vertices = [origin, leftPoint, rightPoint];
    } else {
      const leftIntersection = findRayStartLineIntersection(origin, leftPoint, startLine);
      const rightIntersection = findRayStartLineIntersection(origin, rightPoint, startLine);

      if (leftIntersection && rightIntersection) {
        vertices = [leftIntersection, leftPoint, rightPoint, rightIntersection];
      } else {
        vertices = [origin, leftPoint, rightPoint];
      }
    }

    result.push({
      vertices,
      origin,
      targetSurface,
    });
  }

  return result;
}

/**
 * Calculate the t parameter for a point on a surface segment.
 */
function projectPointToSurfaceT(point: Vector2, surfStart: Vector2, surfEnd: Vector2): number {
  const dx = surfEnd.x - surfStart.x;
  const dy = surfEnd.y - surfStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return 0;
  }

  // Project point onto line and get t parameter
  const t = ((point.x - surfStart.x) * dx + (point.y - surfStart.y) * dy) / lenSq;
  return Math.max(0, Math.min(1, t));
}

/**
 * Interpolate a point on the surface segment.
 */
function interpolateSurface(start: Vector2, end: Vector2, t: number): Vector2 {
  return {
    x: start.x + t * (end.x - start.x),
    y: start.y + t * (end.y - start.y),
  };
}

/**
 * Calculate visible intervals on the target surface.
 *
 * Works in 1D parameter space where t=0 is surface start and t=1 is surface end.
 * Each obstacle creates a blocked interval on the surface.
 * Returns the unblocked (visible) intervals.
 */
function calculateVisibleIntervals(
  origin: Vector2,
  targetSurface: Surface,
  obstacles: readonly Surface[]
): Array<{ start: number; end: number }> {
  const surfStart = targetSurface.segment.start;
  const surfEnd = targetSurface.segment.end;

  // Calculate blocked intervals from each obstacle
  const blockedIntervals: Array<{ start: number; end: number }> = [];

  for (const obs of obstacles) {
    if (obs.id === targetSurface.id) continue;

    // Project obstacle endpoints onto the surface
    const t1 = projectToSurfaceT(origin, obs.segment.start, surfStart, surfEnd);
    const t2 = projectToSurfaceT(origin, obs.segment.end, surfStart, surfEnd);

    // Skip if both projections are outside the surface
    if ((t1 < 0 && t2 < 0) || (t1 > 1 && t2 > 1)) {
      continue;
    }

    // Check if obstacle is between origin and surface
    const obsCenter = {
      x: (obs.segment.start.x + obs.segment.end.x) / 2,
      y: (obs.segment.start.y + obs.segment.end.y) / 2,
    };
    const surfCenter = {
      x: (surfStart.x + surfEnd.x) / 2,
      y: (surfStart.y + surfEnd.y) / 2,
    };
    const obsDist = Math.sqrt((obsCenter.x - origin.x) ** 2 + (obsCenter.y - origin.y) ** 2);
    const surfDist = Math.sqrt((surfCenter.x - origin.x) ** 2 + (surfCenter.y - origin.y) ** 2);

    if (obsDist >= surfDist) {
      continue; // Obstacle is behind the surface
    }

    // Clamp to [0, 1] and add to blocked intervals
    const minT = Math.max(0, Math.min(t1, t2));
    const maxT = Math.min(1, Math.max(t1, t2));

    if (maxT > minT) {
      blockedIntervals.push({ start: minT, end: maxT });
    }
  }

  // Merge overlapping blocked intervals
  blockedIntervals.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];

  for (const interval of blockedIntervals) {
    if (merged.length === 0 || merged[merged.length - 1]!.end < interval.start) {
      merged.push({ ...interval });
    } else {
      merged[merged.length - 1]!.end = Math.max(merged[merged.length - 1]!.end, interval.end);
    }
  }

  // Calculate visible intervals (gaps between blocked)
  const visible: Array<{ start: number; end: number }> = [];
  let currentT = 0;

  for (const blocked of merged) {
    if (blocked.start > currentT) {
      visible.push({ start: currentT, end: blocked.start });
    }
    currentT = Math.max(currentT, blocked.end);
  }

  // Final visible interval from last blocked to end
  if (currentT < 1) {
    visible.push({ start: currentT, end: 1 });
  }

  return visible;
}

/**
 * Project a point onto the surface and return the t parameter (0 to 1).
 * Returns values outside [0, 1] if projection is outside the surface segment.
 */
function projectToSurfaceT(
  origin: Vector2,
  point: Vector2,
  surfStart: Vector2,
  surfEnd: Vector2
): number {
  const rayScale = 100;
  const rayEnd = {
    x: origin.x + (point.x - origin.x) * rayScale,
    y: origin.y + (point.y - origin.y) * rayScale,
  };

  const hit = lineLineIntersection(origin, rayEnd, surfStart, surfEnd);

  if (hit.valid && hit.t > 0) {
    return hit.s; // s is the parameter along the surface (0 to 1)
  }

  // If ray doesn't hit, return a value that indicates which side
  // Use cross-product to determine angular relationship
  const cross = crossProduct(origin, surfStart, point);
  return cross > 0 ? -1 : 2; // -1 for "before" surface, 2 for "after"
}

/**
 * Project a point onto the target surface along a ray from origin.
 *
 * If the point is already on the surface, returns it exactly (provenance).
 * Otherwise, casts a ray from origin through the point and finds where
 * it intersects the target surface segment.
 *
 * If the ray projects past the surface (s > 1 or s < 0), the point is clamped
 * to the nearest surface endpoint. This handles shadows that extend past
 * the surface boundaries.
 *
 * @param origin Ray origin
 * @param point Point to project (may be obstacle endpoint)
 * @param targetSurface Surface to project onto
 * @param surfLeft Left surface endpoint (in cone angular terms)
 * @param surfRight Right surface endpoint (in cone angular terms)
 * @returns Point on surface (clamped if necessary), or null if projection fails
 */
function projectPointToSurface(
  origin: Vector2,
  point: Vector2,
  targetSurface: Surface,
  surfLeft: Vector2,
  surfRight: Vector2
): Vector2 | null {
  const surfStart = targetSurface.segment.start;
  const surfEnd = targetSurface.segment.end;

  // PROVENANCE CHECK: if point is already a surface endpoint, return it exactly
  if (
    (point.x === surfStart.x && point.y === surfStart.y) ||
    (point.x === surfEnd.x && point.y === surfEnd.y)
  ) {
    return point;
  }

  // PROVENANCE CHECK: if point is one of the cone boundaries (surface endpoints)
  if (
    (point.x === surfLeft.x && point.y === surfLeft.y) ||
    (point.x === surfRight.x && point.y === surfRight.y)
  ) {
    return point;
  }

  // Cast ray from origin through point and find intersection with surface LINE
  const rayScale = 100;
  const rayEnd = {
    x: origin.x + (point.x - origin.x) * rayScale,
    y: origin.y + (point.y - origin.y) * rayScale,
  };

  const hit = lineLineIntersection(origin, rayEnd, surfStart, surfEnd);

  if (hit.valid && hit.t > 0) {
    // Check if intersection is within surface segment
    if (hit.s >= 0 && hit.s <= 1) {
      return hit.point;
    }
    
    // Intersection is outside segment - clamp to nearest endpoint
    // Use cross-product to determine which endpoint is closer in angular terms
    const crossPoint = crossProduct(origin, surfLeft, point);
    if (crossPoint >= 0) {
      // Point is CCW from surfLeft (or on it) - closer to left edge
      // If s < 0, the intersection is "before" the surface start
      // Since this point is on the left side, clamp to left
      return hit.s < 0 ? surfStart : surfEnd;
    } else {
      // Point is CW from surfLeft - closer to right edge
      return hit.s > 1 ? surfEnd : surfStart;
    }
  }

  return null;
}

/**
 * Find where a ray from origin through target intersects the startLine.
 *
 * Uses PROVENANCE: if target is a startLine endpoint, returns it exactly.
 */
function findRayStartLineIntersection(
  origin: Vector2,
  target: Vector2,
  startLine: Segment
): Vector2 | null {
  // PROVENANCE CHECK: if target IS a startLine endpoint, return it exactly
  if (
    (target.x === startLine.start.x && target.y === startLine.start.y) ||
    (target.x === startLine.end.x && target.y === startLine.end.y)
  ) {
    return target;
  }

  // Compute intersection
  const rayScale = 10;
  const rayEnd = {
    x: origin.x + (target.x - origin.x) * rayScale,
    y: origin.y + (target.y - origin.y) * rayScale,
  };

  const hit = lineLineIntersection(origin, rayEnd, startLine.start, startLine.end);

  if (hit.valid && hit.t > 0 && hit.s >= 0 && hit.s <= 1) {
    return hit.point;
  }

  return null;
}
