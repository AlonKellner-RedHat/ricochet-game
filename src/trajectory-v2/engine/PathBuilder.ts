/**
 * PathBuilder - Constructs planned and actual trajectory paths
 *
 * @deprecated This module contains the OLD unified path architecture.
 * Use the new two-path architecture instead:
 * - ActualPathCalculator.ts - Pure forward physics (~90 lines)
 * - PlannedPathCalculator.ts - Pure bidirectional images (~95 lines)
 * - DivergenceDetector.ts - Simple waypoint comparison (~70 lines)
 * - DualPathRenderer.ts - Simple color rules (~100 lines)
 * - SimpleTrajectoryCalculator.ts - Combines all (~80 lines)
 *
 * The old architecture (tracePhysicalPath, UnifiedPath) is kept for
 * backward compatibility but should not be used for new code.
 *
 * First Principles:
 * - Planned path uses bidirectional images (player + cursor)
 * - Ray from P_i to C_{n-i} intersects surface[i]
 * - Actual path uses forward physics with obstruction checks
 * - Paths diverge when hit is off-segment or obstructed
 */

import type { Surface } from "@/surfaces/Surface";
import { distance, lineLineIntersection } from "@/trajectory-v2/geometry/GeometryOps";
import { HitPoint, OriginPoint, type SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { type BypassResult, evaluateBypass } from "./BypassEvaluator";
import {
  buildBackwardImages,
  buildForwardImages,
  getCursorImageForSurface,
  getPlayerImageForSurface,
} from "./ImageCache";
import {
  getParametricPosition,
  isHitOnSegment,
  rayLineIntersect,
  raycastForward,
  reflectDirection,
} from "./ValidityChecker";
import type {
  AlignmentResult,
  BypassedSurfaceInfo,
  HitInfo,
  PathResult,
  PathSegment,
  SegmentPlanAlignment,
  TerminationReason,
  UnifiedPath,
} from "./types";

/**
 * Default forward projection distance (in pixels).
 */
const FORWARD_PROJECTION_DISTANCE = 1000;

/**
 * Max reflections during forward projection.
 */
const MAX_PROJECTION_REFLECTIONS = 5;

/**
 * Calculate forward projection with physics simulation.
 *
 * FIRST PRINCIPLE 2.2: Forward projection must follow physically accurate trajectory.
 * - Reflects off reflective surfaces
 * - Stops at walls/obstacles
 *
 * @param startPoint Starting point for projection
 * @param direction Initial direction for projection (normalized)
 * @param surfaces All surfaces to consider for hits
 * @param excludeSurface Surface to exclude (usually the last hit surface)
 * @param projectionDistance Max total distance to project
 * @returns Array of projection points (including reflection points)
 */
function calculateForwardProjectionWithPhysics(
  startPoint: Vector2,
  direction: Vector2,
  surfaces: readonly Surface[],
  excludeSurface: Surface | null = null,
  projectionDistance = FORWARD_PROJECTION_DISTANCE
): Vector2[] {
  const projectionPoints: Vector2[] = [];
  let currentPoint = startPoint;
  let currentDirection = direction;
  let remainingDistance = projectionDistance;
  let lastHitSurface = excludeSurface;

  for (let i = 0; i < MAX_PROJECTION_REFLECTIONS && remainingDistance > 0; i++) {
    const excludeSurfaces = lastHitSurface ? [lastHitSurface] : [];
    const hit = raycastForward(
      currentPoint,
      currentDirection,
      surfaces,
      excludeSurfaces,
      remainingDistance
    );

    if (!hit) {
      // No hit - extend to remaining distance
      const endpoint = {
        x: currentPoint.x + currentDirection.x * remainingDistance,
        y: currentPoint.y + currentDirection.y * remainingDistance,
      };
      projectionPoints.push(endpoint);
      break;
    }

    // Calculate distance to hit
    const hitDist = distance(currentPoint, hit.point);

    // Add hit point
    projectionPoints.push(hit.point);
    remainingDistance -= hitDist;

    if (!hit.canReflect) {
      // Wall hit - stop here
      break;
    }

    // Reflect and continue
    currentDirection = reflectDirection(currentDirection, hit.surface);
    currentPoint = hit.point;
    lastHitSurface = hit.surface;
  }

  return projectionPoints;
}

/**
 * Simple forward projection without physics (just extends direction).
 * Used as fallback when no surfaces provided.
 *
 * @param points Path points (at least 2)
 * @param projectionDistance How far to project
 * @returns Array of projection points [endpoint]
 */
function calculateForwardProjectionSimple(
  points: readonly Vector2[],
  projectionDistance = FORWARD_PROJECTION_DISTANCE
): Vector2[] {
  if (points.length < 2) {
    return [];
  }

  const lastPoint = points[points.length - 1]!;
  const secondToLast = points[points.length - 2]!;

  // Direction from second-to-last to last
  const dx = lastPoint.x - secondToLast.x;
  const dy = lastPoint.y - secondToLast.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len === 0) {
    return [];
  }

  // Normalized direction
  const dirX = dx / len;
  const dirY = dy / len;

  // Project forward
  const projectionPoint: Vector2 = {
    x: lastPoint.x + dirX * projectionDistance,
    y: lastPoint.y + dirY * projectionDistance,
  };

  return [projectionPoint];
}

/**
 * Result of tracing a physics path.
 */
export interface PhysicsPathResult {
  /** Physics segments from start to termination */
  readonly segments: readonly import("./types").PhysicsSegment[];
  /** Total path length */
  readonly totalLength: number;
  /** Whether path was blocked by a wall */
  readonly blockedBy: Surface | null;
}

/**
 * Trace a physics-accurate path from a point in a direction.
 *
 * THIS IS THE SINGLE SOURCE OF TRUTH FOR ACTUAL ARROW PHYSICS.
 *
 * RULES:
 * - Reflects only at ON-SEGMENT hits (physical surface exists)
 * - Stops at walls (non-reflective surfaces)
 * - Ignores off-segment intersections (arrow goes straight through)
 *
 * Used by:
 * - Actual arrow movement
 * - Dashed-yellow visualization
 * - Dashed-red visualization (from cursor)
 *
 * @param start Starting point
 * @param direction Initial direction (normalized)
 * @param surfaces All surfaces to consider
 * @param maxDistance Maximum total distance to trace
 * @param maxReflections Maximum number of reflections
 * @returns Physics path result with segments
 */
export function tracePhysicsPath(
  start: Vector2,
  direction: Vector2,
  surfaces: readonly Surface[],
  maxDistance = 1000,
  maxReflections = 10
): PhysicsPathResult {
  const segments: import("./types").PhysicsSegment[] = [];
  let currentPoint = start;
  let currentDirection = direction;
  let remainingDistance = maxDistance;
  let lastHitSurface: Surface | null = null;
  let blockedBy: Surface | null = null;
  let totalLength = 0;

  for (let i = 0; i < maxReflections && remainingDistance > 0; i++) {
    // Exclude the surface we just reflected off
    const excludeSurfaces = lastHitSurface ? [lastHitSurface] : [];

    // Find first ON-SEGMENT hit in this direction
    // raycastForward already only returns on-segment hits
    const hit = raycastForward(
      currentPoint,
      currentDirection,
      surfaces,
      excludeSurfaces,
      remainingDistance
    );

    if (!hit) {
      // No hit - extend to remaining distance
      const endpoint = {
        x: currentPoint.x + currentDirection.x * remainingDistance,
        y: currentPoint.y + currentDirection.y * remainingDistance,
      };

      const segmentLength = distance(currentPoint, endpoint);
      segments.push({
        start: currentPoint,
        end: endpoint,
        endSurface: null,
        hitOnSegment: false,
        termination: { type: "max_distance" },
      });

      totalLength += segmentLength;
      break;
    }

    // Calculate segment length
    const hitDist = distance(currentPoint, hit.point);
    totalLength += hitDist;
    remainingDistance -= hitDist;

    // Create segment
    segments.push({
      start: currentPoint,
      end: hit.point,
      endSurface: hit.surface,
      hitOnSegment: true, // raycastForward only returns on-segment hits
      termination: !hit.canReflect ? { type: "wall_hit", surface: hit.surface } : undefined,
    });

    if (!hit.canReflect) {
      // Wall hit - stop here
      blockedBy = hit.surface;
      break;
    }

    // Reflect and continue (only for on-segment reflective hits)
    currentDirection = reflectDirection(currentDirection, hit.surface);
    currentPoint = hit.point;
    lastHitSurface = hit.surface;
  }

  // Handle case where we ran out of reflections
  if (
    segments.length > 0 &&
    !segments[segments.length - 1]!.termination &&
    remainingDistance <= 0
  ) {
    // Mark last segment as max reflections reached
    const lastSeg = segments[segments.length - 1]!;
    segments[segments.length - 1] = {
      ...lastSeg,
      termination: { type: "max_reflections" },
    };
  }

  return {
    segments,
    totalLength,
    blockedBy,
  };
}

/**
 * Get direction from path points.
 */
function getDirectionFromPoints(points: readonly Vector2[]): Vector2 | null {
  if (points.length < 2) {
    return null;
  }

  const lastPoint = points[points.length - 1]!;
  const secondToLast = points[points.length - 2]!;

  const dx = lastPoint.x - secondToLast.x;
  const dy = lastPoint.y - secondToLast.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len === 0) {
    return null;
  }

  return { x: dx / len, y: dy / len };
}

/**
 * Build the planned trajectory path using bidirectional image reflection.
 *
 * FIRST PRINCIPLE 6.x (Bypass):
 * Before building the path, evaluate which surfaces should be bypassed based on:
 * - Cursor on wrong side of last surface (6.1)
 * - Player on wrong side of first surface (6.2)
 * - Reflection chain breaks (6.3)
 * - No reflect-through (6.4)
 *
 * FIRST PRINCIPLE 2.4: The planned path's forward projection must also follow physics.
 *
 * For each ACTIVE surface i:
 *   - Ray from P_i (player image at depth i) to C_{n-i} (cursor image at depth n-i)
 *   - Intersect with surface[i]
 *   - Store hit point (even if off-segment)
 *
 * @param player Player position
 * @param cursor Cursor position
 * @param plannedSurfaces Ordered list of surfaces to reflect off
 * @param allSurfaces All surfaces in the scene (for physics-based forward projection)
 * @param precomputedBypass Optional pre-computed bypass result (avoids duplicate evaluation)
 * @returns Path result with hit info and bypass info
 */
export function buildPlannedPath(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[] = [],
  precomputedBypass?: BypassResult
): PathResult {
  // Use precomputed bypass if provided, otherwise evaluate
  const bypassResult =
    precomputedBypass ?? evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);
  const activeSurfaces = bypassResult.activeSurfaces;

  if (activeSurfaces.length === 0) {
    // All surfaces bypassed OR no surfaces planned - direct path to cursor
    const points = [player, cursor];
    const direction = getDirectionFromPoints(points);

    // PRINCIPLE 2.4: Use physics-based projection if surfaces exist
    const forwardProjection = direction
      ? allSurfaces.length > 0
        ? calculateForwardProjectionWithPhysics(cursor, direction, allSurfaces, null)
        : calculateForwardProjectionSimple(points)
      : [];

    return {
      points,
      hitInfo: [],
      reachedCursor: true,
      totalLength: distance(player, cursor),
      forwardProjection,
      bypassedSurfaces: bypassResult.bypassedSurfaces,
    };
  }

  // Build image sequences using ACTIVE surfaces only
  const playerImages = buildForwardImages(player, activeSurfaces);
  const cursorImages = buildBackwardImages(cursor, activeSurfaces);

  const points: Vector2[] = [player];
  const hitInfo: HitInfo[] = [];
  let totalLength = 0;

  // For each ACTIVE surface, find intersection using bidirectional images
  // (bypassed surfaces are excluded from the path calculation)
  for (let i = 0; i < activeSurfaces.length; i++) {
    const surface = activeSurfaces[i]!;
    const segment = surface.segment;

    // Get the appropriate images for this surface
    const playerImage = getPlayerImageForSurface(playerImages, i);
    const cursorImage = getCursorImageForSurface(playerImages, cursorImages, i);

    // Calculate intersection
    const intersection = lineLineIntersection(playerImage, cursorImage, segment.start, segment.end);

    if (!intersection.valid) {
      // This shouldn't happen in a well-formed plan, but handle it
      // Use segment midpoint as fallback
      const midpoint = {
        x: (segment.start.x + segment.end.x) / 2,
        y: (segment.start.y + segment.end.y) / 2,
      };
      const prevPoint = points[points.length - 1]!;
      points.push(midpoint);
      totalLength += distance(prevPoint, midpoint);
      hitInfo.push({
        point: midpoint,
        surface,
        segmentT: 0.5,
        onSegment: true,
        reflected: false,
      });
      continue;
    }

    const hitPoint = intersection.point;

    // CRITICAL: Check if intersection is in FORWARD direction
    // lineLineIntersection can return a point behind the ray origin
    // We need to ensure hitPoint is in the direction toward cursorImage
    const prevPoint = points[points.length - 1]!;
    const toHit = { x: hitPoint.x - prevPoint.x, y: hitPoint.y - prevPoint.y };
    const toCursor = { x: cursorImage.x - prevPoint.x, y: cursorImage.y - prevPoint.y };
    const dot = toHit.x * toCursor.x + toHit.y * toCursor.y;

    if (dot <= 0) {
      // Hit is behind or at origin - skip this surface (bypass case not caught)
      // Don't add this surface to the path
      continue;
    }

    const segmentT = getParametricPosition(hitPoint, segment.start, segment.end);
    const onSegment = isHitOnSegment(segmentT);

    points.push(hitPoint);
    totalLength += distance(prevPoint, hitPoint);

    hitInfo.push({
      point: hitPoint,
      surface,
      segmentT,
      onSegment,
      reflected: onSegment, // Only reflects if on segment
    });
  }

  // Add cursor as final point
  const lastPoint = points[points.length - 1]!;
  points.push(cursor);
  totalLength += distance(lastPoint, cursor);

  // PRINCIPLE 2.4: Use physics-based projection if surfaces exist
  const direction = getDirectionFromPoints(points);
  const forwardProjection = direction
    ? allSurfaces.length > 0
      ? calculateForwardProjectionWithPhysics(cursor, direction, allSurfaces, null)
      : calculateForwardProjectionSimple(points)
    : [];

  return {
    points,
    hitInfo,
    reachedCursor: true,
    totalLength,
    forwardProjection,
    bypassedSurfaces: bypassResult.bypassedSurfaces,
  };
}

/**
 * Build the actual trajectory path using forward physics.
 *
 * FIRST PRINCIPLES:
 * 1. Direction is parameterized by cursor images (bidirectional technique)
 * 2. Actual hits are determined by forward ray casting (real geometry)
 * 3. Only SEGMENT hits count (not extended line intersections)
 * 4. Reflection happens at reflectable surfaces, stops at walls
 * 5. (Unity) Uses same bypass-evaluated surfaces as planned path for direction
 *
 * @param player Player position
 * @param cursor Cursor position
 * @param plannedSurfaces Ordered list of planned surfaces
 * @param allSurfaces All surfaces in the scene
 * @param maxReflections Maximum number of reflections (default 10)
 * @param precomputedBypass Optional pre-computed bypass result (avoids duplicate evaluation)
 * @returns Path result with actual trajectory
 */
export function buildActualPath(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[],
  maxReflections = 10,
  precomputedBypass?: BypassResult
): PathResult {
  const points: Vector2[] = [player];
  const hitInfo: HitInfo[] = [];
  let totalLength = 0;

  // Use precomputed bypass if provided, otherwise evaluate
  const bypassResult =
    precomputedBypass ?? evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);
  const activeSurfaces = bypassResult.activeSurfaces;

  // Get initial direction from bidirectional images using ACTIVE surfaces
  let currentDirection: Vector2;

  if (activeSurfaces.length === 0) {
    // No active surfaces: direction is directly toward cursor
    const dx = cursor.x - player.x;
    const dy = cursor.y - player.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) {
      return {
        points: [player],
        hitInfo: [],
        reachedCursor: true,
        totalLength: 0,
        bypassedSurfaces: bypassResult.bypassedSurfaces,
      };
    }
    currentDirection = { x: dx / len, y: dy / len };
  } else {
    // With active surfaces: direction from player image to cursor image
    const playerImages = buildForwardImages(player, activeSurfaces);
    const cursorImages = buildBackwardImages(cursor, activeSurfaces);

    // Initial direction: from P_0 (player) to C_n (first cursor image)
    const playerImage = getPlayerImageForSurface(playerImages, 0);
    const cursorImage = getCursorImageForSurface(playerImages, cursorImages, 0);

    let dx = cursorImage.x - playerImage.x;
    let dy = cursorImage.y - playerImage.y;
    let len = Math.sqrt(dx * dx + dy * dy);

    // Degenerate case: player and cursor image coincide
    // This happens when the path is perpendicular to the surface
    // Fall back to direction toward the first surface midpoint, then toward cursor
    if (len === 0) {
      const firstSurface = activeSurfaces[0]!;
      const surfaceMid = {
        x: (firstSurface.segment.start.x + firstSurface.segment.end.x) / 2,
        y: (firstSurface.segment.start.y + firstSurface.segment.end.y) / 2,
      };
      dx = surfaceMid.x - player.x;
      dy = surfaceMid.y - player.y;
      len = Math.sqrt(dx * dx + dy * dy);

      if (len === 0) {
        // Still degenerate, use cursor direction
        dx = cursor.x - player.x;
        dy = cursor.y - player.y;
        len = Math.sqrt(dx * dx + dy * dy);

        if (len === 0) {
          return {
            points: [player],
            hitInfo: [],
            reachedCursor: true,
            totalLength: 0,
            bypassedSurfaces: bypassResult.bypassedSurfaces,
          };
        }
      }
    }
    currentDirection = { x: dx / len, y: dy / len };
  }

  // Forward ray casting loop
  let currentPoint = player;
  let lastHitSurface: Surface | null = null;
  let reflectionCount = 0;

  while (reflectionCount < maxReflections) {
    // Cast ray forward to find first hit
    const excludeSurfaces = lastHitSurface ? [lastHitSurface] : [];
    const hit = raycastForward(currentPoint, currentDirection, allSurfaces, excludeSurfaces);

    // Check if cursor is between current point and hit (or at max distance if no hit)
    // This is needed to end the path at cursor when cursor is on the path
    const toCursor = {
      x: cursor.x - currentPoint.x,
      y: cursor.y - currentPoint.y,
    };
    const dotWithDir = toCursor.x * currentDirection.x + toCursor.y * currentDirection.y;

    // IMPORTANT: Only check for cursor on path AFTER all planned surfaces have been hit.
    // If we have active surfaces and haven't hit them all yet, the cursor might be
    // "on the path" but reached via reflection AFTER hitting the surface.
    // Example: player (100,300) → surface (300,y) → cursor (150,300)
    // The cursor IS on the forward path direction, but should be reached via reflection.
    const allPlannedSurfacesHit = reflectionCount >= activeSurfaces.length;

    if (allPlannedSurfacesHit && dotWithDir > 0) {
      // Cursor is ahead in this direction
      const cursorDist = Math.sqrt(toCursor.x * toCursor.x + toCursor.y * toCursor.y);
      // Check if cursor is roughly in line with current direction
      const crossProduct = currentDirection.x * toCursor.y - currentDirection.y * toCursor.x;
      const deviation = Math.abs(crossProduct) / cursorDist;

      if (deviation < 0.01) {
        // Cursor is on the path - check if it's before any hit
        const hitDist = hit ? distance(currentPoint, hit.point) : Number.POSITIVE_INFINITY;

        if (cursorDist < hitDist) {
          // Cursor is before the hit (or there's no hit) - end at cursor
          points.push(cursor);
          totalLength += distance(currentPoint, cursor);

          // PRINCIPLE 2.2: Forward projection must follow physics
          const forwardProjection = calculateForwardProjectionWithPhysics(
            cursor,
            currentDirection,
            allSurfaces,
            lastHitSurface
          );

          return {
            points,
            hitInfo,
            reachedCursor: true,
            totalLength,
            forwardProjection,
            bypassedSurfaces: bypassResult.bypassedSurfaces,
          };
        }
      }
    }

    if (!hit) {
      // No hit and cursor not on path - extend to max distance
      const maxDist = 2000;
      const endpoint = {
        x: currentPoint.x + currentDirection.x * maxDist,
        y: currentPoint.y + currentDirection.y * maxDist,
      };
      points.push(endpoint);
      totalLength += maxDist;
      break;
    }

    // Add hit point
    points.push(hit.point);
    totalLength += distance(currentPoint, hit.point);

    // Record hit info
    const segment = hit.surface.segment;
    const segmentT = getParametricPosition(hit.point, segment.start, segment.end);
    const onSegment = isHitOnSegment(segmentT);

    hitInfo.push({
      point: hit.point,
      surface: hit.surface,
      segmentT,
      onSegment,
      reflected: hit.canReflect,
    });

    // Check if we can reflect
    if (!hit.canReflect) {
      // Hit a wall or non-reflectable surface - stop
      // No forward projection for walls (arrow stops here)
      return {
        points,
        hitInfo,
        reachedCursor: false,
        blockedBy: hit.surface,
        totalLength,
        forwardProjection: [], // Empty - arrow stops at wall
        bypassedSurfaces: bypassResult.bypassedSurfaces,
      };
    }

    // Reflect direction
    currentDirection = reflectDirection(currentDirection, hit.surface);
    currentPoint = hit.point;
    lastHitSurface = hit.surface;
    reflectionCount++;
  }

  // Check if we reached cursor
  const lastPoint = points[points.length - 1];
  const reachedCursor = lastPoint ? distance(lastPoint, cursor) < 1 : false;

  // PRINCIPLE 2.2: Forward projection must follow physics
  const forwardProjection = calculateForwardProjectionWithPhysics(
    lastPoint || player,
    currentDirection,
    allSurfaces,
    lastHitSurface
  );

  return {
    points,
    hitInfo,
    reachedCursor,
    totalLength,
    forwardProjection,
    bypassedSurfaces: bypassResult.bypassedSurfaces,
  };
}

/**
 * Calculate alignment between planned and actual paths.
 *
 * @param planned Planned path result
 * @param actual Actual path result
 * @returns Alignment result for rendering and validity
 */
export function calculateAlignment(planned: PathResult, actual: PathResult): AlignmentResult {
  if (planned.points.length < 2 || actual.points.length < 2) {
    return {
      isFullyAligned: false,
      alignedSegmentCount: 0,
      firstMismatchIndex: 0,
      divergencePoint: planned.points[0] || { x: 0, y: 0 },
    };
  }

  let alignedSegmentCount = 0;
  let divergencePoint: Vector2 | undefined;

  const minLength = Math.min(planned.points.length, actual.points.length);

  for (let i = 0; i < minLength - 1; i++) {
    const plannedStart = planned.points[i]!;
    const plannedEnd = planned.points[i + 1]!;
    const actualStart = actual.points[i]!;
    const actualEnd = actual.points[i + 1]!;

    // Check if segment starts align
    if (distance(plannedStart, actualStart) > 0.01) {
      divergencePoint = plannedStart;
      break;
    }

    // Check if segment directions align
    const plannedDx = plannedEnd.x - plannedStart.x;
    const plannedDy = plannedEnd.y - plannedStart.y;
    const actualDx = actualEnd.x - actualStart.x;
    const actualDy = actualEnd.y - actualStart.y;

    const plannedLen = Math.sqrt(plannedDx * plannedDx + plannedDy * plannedDy);
    const actualLen = Math.sqrt(actualDx * actualDx + actualDy * actualDy);

    if (plannedLen === 0 || actualLen === 0) {
      divergencePoint = plannedStart;
      break;
    }

    // Normalize and compare
    const dotProduct =
      (plannedDx / plannedLen) * (actualDx / actualLen) +
      (plannedDy / plannedLen) * (actualDy / actualLen);

    if (dotProduct < 1) {
      divergencePoint = plannedStart;
      break;
    }

    // Check if segment ends align
    if (distance(plannedEnd, actualEnd) > 0.01) {
      // Segments go same direction but different lengths
      // Divergence is at the shorter endpoint
      if (actualLen < plannedLen) {
        divergencePoint = actualEnd;
      } else {
        divergencePoint = plannedEnd;
      }
      alignedSegmentCount++;
      break;
    }

    alignedSegmentCount++;
  }

  const isFullyAligned =
    actual.reachedCursor &&
    planned.reachedCursor &&
    alignedSegmentCount === planned.points.length - 1;

  return {
    isFullyAligned,
    alignedSegmentCount,
    firstMismatchIndex: isFullyAligned ? -1 : alignedSegmentCount,
    divergencePoint: isFullyAligned ? undefined : divergencePoint,
  };
}

// =============================================================================
// UNIFIED PATH (New Architecture)
// =============================================================================

/**
 * Options for path tracing.
 */
export interface TraceOptions {
  /** Maximum number of reflections (default 10) */
  readonly maxReflections?: number;
  /** Maximum total path distance (default 2000) */
  readonly maxDistance?: number;
}

const DEFAULT_TRACE_OPTIONS: Required<TraceOptions> = {
  maxReflections: 10,
  maxDistance: 2000,
};

/**
 * Trace a physical path with inline plan checking.
 *
 * DESIGN PRINCIPLE: Single path, annotated during creation.
 *
 * This function:
 * 1. Uses bidirectional images to determine initial direction (from active surfaces)
 * 2. Traces forward using physics (ray casting)
 * 3. For each hit, checks if it matches the next expected planned surface
 * 4. Annotates each segment with its plan alignment
 * 5. Returns a continuous path including segments beyond cursor
 *
 * Edge cases eliminated:
 * - No tolerance-based path comparison
 * - No separate forward projection
 * - No alignment detection after the fact
 *
 * @param player Player position
 * @param cursor Cursor position
 * @param bypassResult Pre-computed bypass result (from TrajectoryEngine)
 * @param allSurfaces All surfaces in the scene
 * @param options Trace options
 * @returns UnifiedPath with all segments and derived properties
 */
export function tracePhysicalPath(
  player: Vector2,
  cursor: Vector2,
  bypassResult: BypassResult,
  allSurfaces: readonly Surface[],
  options: TraceOptions = {}
): UnifiedPath {
  const opts = { ...DEFAULT_TRACE_OPTIONS, ...options };
  const activeSurfaces = bypassResult.activeSurfaces;

  // Reconstruct all planned surfaces (active + bypassed) for out-of-order detection
  const allPlannedSurfaces = [
    ...activeSurfaces,
    ...bypassResult.bypassedSurfaces.map((b) => b.surface),
  ].filter((s): s is Surface => s !== undefined);

  // Step 1: Calculate initial direction using bidirectional images
  let initialDirection: Vector2;

  if (activeSurfaces.length === 0) {
    // No active surfaces: direction is directly toward cursor
    const dx = cursor.x - player.x;
    const dy = cursor.y - player.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) {
      // Degenerate: player and cursor at same position
      return createDegeneratePath(player, activeSurfaces.length);
    }
    initialDirection = { x: dx / len, y: dy / len };
  } else {
    // With active surfaces: direction from player image to cursor image
    const playerImages = buildForwardImages(player, activeSurfaces);
    const cursorImages = buildBackwardImages(cursor, activeSurfaces);

    const playerImage = getPlayerImageForSurface(playerImages, 0);
    const cursorImage = getCursorImageForSurface(playerImages, cursorImages, 0);

    let dx = cursorImage.x - playerImage.x;
    let dy = cursorImage.y - playerImage.y;
    let len = Math.sqrt(dx * dx + dy * dy);

    if (len === 0) {
      // Fallback: direction toward first surface midpoint
      const firstSurface = activeSurfaces[0]!;
      const mid = {
        x: (firstSurface.segment.start.x + firstSurface.segment.end.x) / 2,
        y: (firstSurface.segment.start.y + firstSurface.segment.end.y) / 2,
      };
      dx = mid.x - player.x;
      dy = mid.y - player.y;
      len = Math.sqrt(dx * dx + dy * dy);

      if (len === 0) {
        return createDegeneratePath(player, activeSurfaces.length);
      }
    }
    initialDirection = { x: dx / len, y: dy / len };
  }

  // Step 2: Trace forward using physics
  const segments: PathSegment[] = [];
  let currentPoint = player;
  let currentDirection = initialDirection;
  let lastHitSurface: Surface | null = null;
  let totalLength = 0;

  // Plan tracking
  let nextExpectedPlanIndex = 0;
  let hasDiverged = false;
  let cursorSegmentIndex = -1;
  let cursorT = 0;

  for (let i = 0; i < opts.maxReflections; i++) {
    // Cast ray forward
    const excludeSurfaces = lastHitSurface ? [lastHitSurface] : [];
    let hit = raycastForward(
      currentPoint,
      currentDirection,
      allSurfaces,
      excludeSurfaces,
      opts.maxDistance
    );

    // FIRST PRINCIPLE: For planned surfaces, check intersection with EXTENDED LINE
    // If the ray would hit the extended line of the next expected planned surface
    // (even if off-segment), we should use that for the planned path.
    let plannedLineHit: { point: Vector2; isOnSegment: boolean } | null = null;
    if (nextExpectedPlanIndex < activeSurfaces.length) {
      const expectedSurface = activeSurfaces[nextExpectedPlanIndex]!;
      const lineResult = rayLineIntersect(
        currentPoint,
        currentDirection,
        expectedSurface,
        opts.maxDistance
      );

      if (lineResult) {
        // Check if this planned line hit is BEFORE any physical hit
        const physicalHitDist = hit ? distance(currentPoint, hit.point) : Number.POSITIVE_INFINITY;
        const plannedHitDist = lineResult.t;

        if (plannedHitDist < physicalHitDist + 1) {
          // The planned surface line is hit before (or at) the physical hit
          // Use this as the hit point for the planned path
          plannedLineHit = {
            point: lineResult.point,
            isOnSegment: lineResult.isOnSegment,
          };

          // Override the hit with the planned surface intersection
          hit = {
            surface: expectedSurface,
            point: lineResult.point,
            t: plannedHitDist,
            segmentT: 0.5, // Not used for off-segment
            canReflect: expectedSurface.canReflectFrom(currentDirection),
            incomingDirection: currentDirection,
            isOnSegment: lineResult.isOnSegment, // Track if on segment
          } as RaycastHit & { isOnSegment?: boolean };
        }
      }
    }

    // Check if cursor is on this segment
    const cursorCheck = checkCursorOnSegment(currentPoint, currentDirection, cursor, hit);

    // Determine segment endpoint and termination
    let endpoint: Vector2;
    let endSurface: Surface | null = null;
    let termination: TerminationReason | undefined;
    let hitOnSegment = false;

    if (cursorCheck.isOnPath && cursorCheck.isBefore) {
      // Cursor is on path before hit - this segment ends at cursor
      endpoint = cursor;
      cursorSegmentIndex = segments.length;
      cursorT = cursorCheck.t;

      // But we DON'T terminate - we continue to build the full path for projection
      // Create segment to cursor first
      const segmentLength = distance(currentPoint, endpoint);
      const isFirstSegment = segments.length === 0;
      const alignment = determinePlanAlignment(
        null, // No surface hit
        activeSurfaces,
        allPlannedSurfaces,
        nextExpectedPlanIndex,
        hasDiverged,
        isFirstSegment
      );

      segments.push({
        start: currentPoint,
        end: endpoint,
        endSurface: null,
        planAlignment: alignment,
        hitOnSegment: false,
        termination: { type: "cursor_reached" },
      });

      totalLength += segmentLength;

      // Continue from cursor to the hit (or max distance)
      currentPoint = cursor;

      // Check if there's still a hit after cursor
      if (hit && distance(cursor, hit.point) > 0.01) {
        // There's more path after cursor - continue to trace it
        continue;
      } else if (!hit) {
        // No hit - extend to max distance from cursor
        const remainingDist = opts.maxDistance - totalLength;
        if (remainingDist > 0) {
          const finalPoint = {
            x: cursor.x + currentDirection.x * remainingDist,
            y: cursor.y + currentDirection.y * remainingDist,
          };
          segments.push({
            start: cursor,
            end: finalPoint,
            endSurface: null,
            planAlignment: "unplanned",
            hitOnSegment: false,
            termination: { type: "max_distance" },
          });
          totalLength += remainingDist;
        }
        break;
      }
    }

    if (hit) {
      endpoint = hit.point;
      endSurface = hit.surface;
      // Use isOnSegment from planned line hit if available, otherwise assume on-segment
      hitOnSegment = plannedLineHit ? plannedLineHit.isOnSegment : true;

      if (!hit.canReflect) {
        termination = { type: "wall_hit", surface: hit.surface };
      }
    } else {
      // No hit - extend to max distance
      const remainingDist = opts.maxDistance - totalLength;
      endpoint = {
        x: currentPoint.x + currentDirection.x * remainingDist,
        y: currentPoint.y + currentDirection.y * remainingDist,
      };
      termination = { type: "max_distance" };
    }

    // Step 3: Determine plan alignment for this segment
    // FIRST PRINCIPLE: First segment is always aligned (same initial direction)
    const isFirstSegmentInLoop = segments.length === 0;
    const alignment = determinePlanAlignment(
      endSurface,
      activeSurfaces,
      allPlannedSurfaces,
      nextExpectedPlanIndex,
      hasDiverged,
      isFirstSegmentInLoop
    );

    // Update plan tracking
    // FIRST PRINCIPLE: Check if we actually hit the expected planned surface
    const expectedSurface = activeSurfaces[nextExpectedPlanIndex];
    const hitExpectedSurface =
      endSurface && expectedSurface && endSurface.id === expectedSurface.id;

    if (hitExpectedSurface) {
      // We hit the expected planned surface - advance the plan
      nextExpectedPlanIndex++;

      // FIRST PRINCIPLE: If hit was OFF-SEGMENT, the actual arrow doesn't
      // hit the physical surface - it goes straight through. The planned path
      // reflects, but the actual path continues straight. This is DIVERGENCE.
      if (!hitOnSegment && hit && hit.canReflect) {
        hasDiverged = true;
      }
    } else if (
      isFirstSegmentInLoop &&
      endSurface &&
      nextExpectedPlanIndex < activeSurfaces.length
    ) {
      // FIRST PRINCIPLE: First segment hit an OBSTRUCTION (not the planned surface)
      // The first segment is aligned (correct direction), but subsequent segments
      // are diverged because we're blocked from reaching the planned surface.
      hasDiverged = true;
    } else if (alignment === "diverged") {
      hasDiverged = true;
    }

    // Create segment
    const segmentLength = distance(currentPoint, endpoint);
    segments.push({
      start: currentPoint,
      end: endpoint,
      endSurface,
      planAlignment: alignment,
      hitOnSegment,
      termination,
    });

    totalLength += segmentLength;

    // Check cursor on this segment (if not already found)
    // IMPORTANT: Only set cursorSegmentIndex if cursor is WITHIN the segment
    // If segment terminates (wall/max_distance) and cursor is beyond it,
    // cursor is NOT reachable on this segment
    if (cursorSegmentIndex === -1 && cursorCheck.isOnPath && !cursorCheck.isBefore) {
      // Check if cursor is actually within this segment (not beyond it)
      const cursorDistFromStart = distance(currentPoint, cursor);
      const segmentEndDistFromStart = distance(currentPoint, endpoint);

      if (cursorDistFromStart <= segmentEndDistFromStart + 1) {
        // Cursor is within the segment
        cursorSegmentIndex = segments.length - 1;
        cursorT = cursorCheck.t;
      }
      // else: cursor is beyond this segment's endpoint, not reachable here
    }

    // Check for termination
    if (termination) {
      break;
    }

    // Reflect and continue
    if (hit && hit.canReflect) {
      // FIRST PRINCIPLE: If we're reflecting off an UNPLANNED surface,
      // set hasDiverged = true so the NEXT segment is marked as diverged.
      // The current segment (ending at the surface) remains "unplanned" (green).
      //
      // KEY: Check if the surface we're reflecting off is in the planned surfaces list.
      // We use alignment === "aligned" to know if we just hit an expected surface.
      // If alignment was "aligned", we reflected off a PLANNED surface - no divergence.
      // If alignment was NOT "aligned", we reflected off an UNPLANNED surface - divergence.
      //
      // FIRST PRINCIPLE: With EMPTY plan (no planned surfaces), there's nothing to
      // diverge from. All segments should remain "unplanned" (green before cursor,
      // yellow after cursor). Only set hasDiverged if there actually IS a plan.
      if (alignment !== "aligned" && activeSurfaces.length > 0) {
        // Reflected off unplanned/unexpected surface when there IS a plan - diverge
        hasDiverged = true;
      }

      currentDirection = reflectDirection(currentDirection, hit.surface);
      currentPoint = endpoint;
      lastHitSurface = hit.surface;
    } else {
      break;
    }
  }

  // Step 4: Derive properties
  const firstDivergedIndex = segments.findIndex((s) => s.planAlignment === "diverged");
  const isFullyAligned =
    firstDivergedIndex === -1 && nextExpectedPlanIndex >= activeSurfaces.length;

  // Cursor is reachable if it was reached in an aligned/unplanned segment
  // BEFORE any divergence. This handles the case where the path loops back
  // to the cursor position after diverging.
  let cursorReachable = false;
  if (cursorSegmentIndex !== -1) {
    if (firstDivergedIndex === -1) {
      // No divergence at all - cursor is reachable
      cursorReachable = true;
    } else if (cursorSegmentIndex < firstDivergedIndex) {
      // Cursor reached before divergence
      cursorReachable = true;
    } else {
      // Check if there's an earlier segment that ends at cursor
      // (path might reach cursor multiple times)
      for (let i = 0; i < firstDivergedIndex && i < segments.length; i++) {
        const seg = segments[i]!;
        if (distance(seg.end, cursor) < 1) {
          cursorReachable = true;
          // Update cursorSegmentIndex to the FIRST segment that reaches cursor
          cursorSegmentIndex = i;
          break;
        }
      }
    }
  }

  // Step 5: Trace actual physics path (single source of truth for arrow physics)
  // This path only reflects at ON-SEGMENT hits - no off-segment reflections
  const actualPhysics = tracePhysicsPath(
    player,
    initialDirection,
    allSurfaces,
    opts.maxDistance,
    opts.maxReflections
  );

  // Step 6: Find where actual physics diverges from planned path
  const physicsDivergenceIndex = findPhysicsDivergenceIndex(segments, actualPhysics.segments);

  // Step 7: Build waypointSources with provenance for arrow system
  // Uses segments to create SourcePoints with proper provenance
  const waypointSources = buildWaypointSources(player, cursor, segments, cursorReachable);

  return {
    segments,
    cursorSegmentIndex,
    cursorT,
    cursorReachable,
    firstDivergedIndex,
    isFullyAligned,
    plannedSurfaceCount: activeSurfaces.length,
    totalLength,
    actualPhysicsSegments: actualPhysics.segments,
    physicsDivergenceIndex,
    waypointSources,
  };
}

/**
 * Build waypointSources with provenance for arrow system.
 *
 * UNIFIED TYPES: Creates SourcePoints matching trajectory/visibility systems.
 * - First element is OriginPoint (player position)
 * - HitPoints carry surface/ray info for each reflection point
 * - Last may be OriginPoint (cursor) if cursorReachable
 *
 * @param player Player position
 * @param cursor Cursor position
 * @param segments Path segments
 * @param cursorReachable Whether cursor is reachable
 * @returns Array of SourcePoints with provenance
 */
function buildWaypointSources(
  player: Vector2,
  cursor: Vector2,
  segments: readonly PathSegment[],
  cursorReachable: boolean
): SourcePoint[] {
  const sources: SourcePoint[] = [];

  // First waypoint is always the player (OriginPoint)
  sources.push(new OriginPoint(player));

  // Add HitPoints for each segment endpoint that hits a surface
  for (const segment of segments) {
    if (segment.endSurface) {
      // Create a HitPoint with provenance
      // Note: We create a ray from segment start to end for context
      const ray = { source: segment.start, target: segment.end };

      // Calculate parametric position on the surface segment
      const surf = segment.endSurface;
      const dx = surf.segment.end.x - surf.segment.start.x;
      const dy = surf.segment.end.y - surf.segment.start.y;
      const segLen = Math.sqrt(dx * dx + dy * dy);

      let s = 0.5; // Default to midpoint
      if (segLen > 0) {
        const hx = segment.end.x - surf.segment.start.x;
        const hy = segment.end.y - surf.segment.start.y;
        s = (hx * dx + hy * dy) / (segLen * segLen);
        s = Math.max(0, Math.min(1, s));
      }

      // Calculate t as distance ratio from ray start to hit
      const rayDx = segment.end.x - segment.start.x;
      const rayDy = segment.end.y - segment.start.y;
      const rayLen = Math.sqrt(rayDx * rayDx + rayDy * rayDy);
      const t = rayLen > 0 ? 1 : 0; // t=1 at the segment end

      sources.push(new HitPoint(ray, segment.endSurface, t, s));
    }
  }

  // Add cursor as final OriginPoint if reachable
  if (cursorReachable) {
    sources.push(new OriginPoint(cursor));
  }

  return sources;
}

/**
 * Find the index where actual physics diverges from planned path.
 * Returns -1 if paths are identical (no divergence).
 *
 * FIRST PRINCIPLE: Physics divergence happens when the planned path reflects
 * at an OFF-SEGMENT point but the actual arrow goes straight through
 * (because there's no physical surface to hit).
 *
 * This is NOT about segment count differences (paths can be segmented differently
 * but still be geometrically identical). It's about when hitOnSegment === false
 * on a segment that ends at a planned surface.
 */
function findPhysicsDivergenceIndex(
  plannedSegments: readonly PathSegment[],
  _physicsSegments: readonly import("./types").PhysicsSegment[]
): number {
  // Look for segments where the planned path hit an off-segment point
  // This is where actual physics diverges (arrow goes straight, planned reflects)
  for (let i = 0; i < plannedSegments.length; i++) {
    const planned = plannedSegments[i]!;

    // Divergence happens when:
    // 1. Segment hit a surface (endSurface !== null)
    // 2. Hit was OFF-segment (hitOnSegment === false)
    // 3. Segment was "aligned" (part of the plan)
    if (
      planned.endSurface !== null &&
      planned.hitOnSegment === false &&
      planned.planAlignment === "aligned"
    ) {
      return i;
    }
  }

  return -1; // No divergence
}

/**
 * Create a degenerate path (player at cursor or zero-length direction).
 */
function createDegeneratePath(player: Vector2, plannedCount: number): UnifiedPath {
  return {
    segments: [],
    cursorSegmentIndex: -1,
    cursorT: 0,
    cursorReachable: true,
    firstDivergedIndex: -1,
    isFullyAligned: plannedCount === 0,
    plannedSurfaceCount: plannedCount,
    totalLength: 0,
    actualPhysicsSegments: [],
    physicsDivergenceIndex: -1,
  };
}

/**
 * Check if cursor is on the current segment.
 */
function checkCursorOnSegment(
  start: Vector2,
  direction: Vector2,
  cursor: Vector2,
  hit: { point: Vector2 } | null
): { isOnPath: boolean; isBefore: boolean; t: number } {
  const toCursor = {
    x: cursor.x - start.x,
    y: cursor.y - start.y,
  };

  // Project cursor onto ray
  const dotWithDir = toCursor.x * direction.x + toCursor.y * direction.y;

  if (dotWithDir <= 0) {
    // Cursor is behind or at start
    return { isOnPath: false, isBefore: false, t: 0 };
  }

  const cursorDist = Math.sqrt(toCursor.x * toCursor.x + toCursor.y * toCursor.y);

  // Check if cursor is on the ray (perpendicular distance is small)
  const crossProduct = direction.x * toCursor.y - direction.y * toCursor.x;
  const perpDist = Math.abs(crossProduct);

  if (perpDist > 1) {
    // Cursor is too far from ray (more than 1 pixel)
    return { isOnPath: false, isBefore: false, t: 0 };
  }

  // Cursor is on ray - check if before hit
  const hitDist = hit ? distance(start, hit.point) : Number.POSITIVE_INFINITY;
  const isBefore = cursorDist < hitDist;

  // Calculate t (parametric position)
  const segmentLength = isBefore ? cursorDist : hitDist;
  const t = segmentLength > 0 ? cursorDist / segmentLength : 0;

  return { isOnPath: true, isBefore, t: Math.min(t, 1) };
}

/**
 * Determine plan alignment for a segment based on hit surface.
 *
 * FIRST PRINCIPLES:
 * 1. The planned path and the actual path must start aligned, from the player
 *    position and in the same direction (calculated using cursor images).
 * 2. The solid section of the planned path should reflect only off planned surfaces.
 * 3. Reflecting off a non-planned surface causes divergence for SUBSEQUENT segments.
 *
 * DESIGN PRINCIPLE: Simple check, no tolerance.
 * - First segment before planned surface hit = always aligned (direction is correct)
 * - Hit expected planned surface = aligned
 * - After first segment, hit different surface = diverged
 * - No plan but going toward cursor = unplanned (green)
 * - After divergence, all segments = diverged
 */
function determinePlanAlignment(
  hitSurface: Surface | null,
  activeSurfaces: readonly Surface[],
  allPlannedSurfaces: readonly Surface[],
  nextExpectedIndex: number,
  hasDiverged: boolean,
  isFirstSegment = false
): SegmentPlanAlignment {
  // FIRST PRINCIPLE: Segment alignment is based on what happened BEFORE this segment,
  // not what happens at its end. Divergence applies to the NEXT segment after
  // reflecting off an unplanned surface or hitting an obstruction.

  // Once diverged, all subsequent segments are diverged
  if (hasDiverged) {
    return "diverged";
  }

  // No more planned surfaces expected
  if (nextExpectedIndex >= activeSurfaces.length) {
    // Plan is empty/exhausted - segment going toward cursor is "unplanned" (aligned)
    // If we hit a reflective surface, divergence will be set for the NEXT segment
    // (handled in tracePhysicalPath after this function returns)
    return "unplanned";
  }

  const expectedSurface = activeSurfaces[nextExpectedIndex];

  // No hit but expecting a surface = still on track toward first planned surface
  if (!hitSurface) {
    return "unplanned";
  }

  // Check if we hit the expected surface
  if (hitSurface.id === expectedSurface?.id) {
    return "aligned";
  }

  // FIRST PRINCIPLE 6.11: Out-of-Order Surface Hit
  // If we hit a surface that exists in the ORIGINAL plan (including bypassed ones),
  // but it's not the expected next surface, this is a divergence.
  // This catches cases where a later-planned surface is hit before an earlier one.
  const hitAnyPlannedSurface = allPlannedSurfaces.some((s) => s.id === hitSurface.id);
  const hitExpectedSurface = hitSurface.id === expectedSurface?.id;

  if (hitAnyPlannedSurface && !hitExpectedSurface) {
    // Hit a planned surface OUT OF ORDER - this is divergence
    // Even on first segment, this means the actual path deviated from expected order
    return "diverged";
  }

  // FIRST PRINCIPLE: The first segment hitting an UNPLANNED obstruction is still
  // "aligned" up to that point. Both paths started in the same direction,
  // but an obstruction blocked the actual path. Divergence will be marked
  // for subsequent segments by tracePhysicalPath.
  if (isFirstSegment) {
    return "aligned";
  }

  // Hit a different surface = diverged
  return "diverged";
}

/**
 * Convert UnifiedPath to legacy PathResult for backward compatibility.
 * This allows gradual migration to the new architecture.
 */
export function unifiedToPathResult(
  unified: UnifiedPath,
  cursor: Vector2,
  bypassResult: BypassResult
): PathResult {
  // Extract points from segments
  const points: Vector2[] = [];
  if (unified.segments.length > 0) {
    points.push(unified.segments[0]!.start);
    for (const seg of unified.segments) {
      points.push(seg.end);
    }
  }

  // Build hit info from segments
  const hitInfo: HitInfo[] = [];
  for (const seg of unified.segments) {
    if (seg.endSurface) {
      const segmentT = getParametricPosition(
        seg.end,
        seg.endSurface.segment.start,
        seg.endSurface.segment.end
      );
      hitInfo.push({
        point: seg.end,
        surface: seg.endSurface,
        segmentT,
        onSegment: seg.hitOnSegment,
        reflected: seg.termination === undefined, // Reflected if not terminal
      });
    }
  }

  // Find cursor point and projection
  const cursorIndex = unified.cursorSegmentIndex;
  const forwardProjection: Vector2[] = [];

  if (cursorIndex !== -1 && cursorIndex < unified.segments.length - 1) {
    // Projection is segments after cursor
    for (let i = cursorIndex + 1; i < unified.segments.length; i++) {
      forwardProjection.push(unified.segments[i]!.end);
    }
  }

  return {
    points,
    hitInfo,
    reachedCursor: unified.cursorReachable,
    totalLength: unified.totalLength,
    forwardProjection,
    bypassedSurfaces: bypassResult.bypassedSurfaces,
  };
}

/**
 * Convert UnifiedPath to legacy AlignmentResult for backward compatibility.
 */
export function unifiedToAlignment(unified: UnifiedPath): AlignmentResult {
  let divergencePoint: Vector2 | undefined;

  if (unified.firstDivergedIndex !== -1 && unified.segments.length > 0) {
    const divergedSeg = unified.segments[unified.firstDivergedIndex];
    divergencePoint = divergedSeg?.start;
  }

  return {
    isFullyAligned: unified.isFullyAligned,
    alignedSegmentCount:
      unified.firstDivergedIndex === -1 ? unified.segments.length : unified.firstDivergedIndex,
    firstMismatchIndex: unified.firstDivergedIndex,
    divergencePoint,
  };
}
