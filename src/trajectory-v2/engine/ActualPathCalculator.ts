/**
 * ActualPathCalculator - Calculates the physical trajectory using forward physics
 *
 * FIRST PRINCIPLES:
 * - B1: Uses forward physics (ray cast from player, reflect on hit)
 * - B4: Obstructions cause blocking (walls stop, surfaces reflect)
 * - D1: Only reflects on-segment (not extended line)
 * - D3: This is what the arrow actually does
 *
 * DESIGN PRINCIPLE: This is an INDEPENDENT calculation.
 * The actual path shows what physically happens when the arrow is shot.
 * It has NO knowledge of the planned path or which surfaces were "planned".
 *
 * UNIFIED TYPES:
 * - Uses SourcePoint for waypoints (OriginPoint, HitPoint) for provenance
 * - Uses unified RayCasting primitives
 * - Supports both Surface[] and SurfaceChain[]
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { distance } from "@/trajectory-v2/geometry/GeometryOps";
import {
  raycastForwardWithProvenance,
  extractSurfacesFromChains,
} from "@/trajectory-v2/geometry/RayCasting";
import {
  OriginPoint,
  type SourcePoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import type { SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import { reflectDirection } from "./ValidityChecker";

/**
 * Information about a surface hit during actual path calculation.
 */
export interface ActualHit {
  /** The intersection point */
  readonly point: Vector2;
  /** The surface that was hit */
  readonly surface: Surface;
  /** Whether the surface was reflected off (vs blocked) */
  readonly reflected: boolean;
}

/**
 * The complete actual trajectory path.
 *
 * DESIGN PRINCIPLE: Calculated independently of planned path.
 * This is what the arrow physically does.
 *
 * FIRST PRINCIPLE: Waypoints go from player to cursor (or termination).
 * Forward projection is stored separately for rendering.
 *
 * PROVENANCE: waypointSources contains SourcePoint[] with provenance:
 * - OriginPoint for player/cursor positions
 * - HitPoint for surface hits with ray/surface/t/s info
 */
export interface ActualPath {
  /** Waypoints from player to cursor/termination (NOT including forward projection) */
  readonly waypoints: readonly Vector2[];
  /** 
   * Waypoints with provenance (SourcePoint types).
   * - First element is always OriginPoint (player)
   * - HitPoints carry ray/surface/t/s provenance
   * - Last may be OriginPoint (cursor) if reachedCursor is true
   */
  readonly waypointSources: readonly SourcePoint[];
  /** Information about each surface hit */
  readonly hits: readonly ActualHit[];
  /** Index of segment containing cursor (-1 if cursor not on path) */
  readonly cursorIndex: number;
  /** Parametric position of cursor within segment (0-1) */
  readonly cursorT: number;
  /** Whether the path reached the cursor */
  readonly reachedCursor: boolean;
  /** Surface that blocked the path (if any) */
  readonly blockedBy: Surface | null;
  /** Forward projection waypoints (beyond cursor, for rendering only) */
  readonly forwardProjection: readonly Vector2[];
  /** Forward projection with provenance */
  readonly forwardProjectionSources: readonly SourcePoint[];
}

/**
 * Check if cursor is on the ray segment between start and hit.
 */
function checkCursorOnRay(
  start: Vector2,
  direction: Vector2,
  cursor: Vector2,
  hitDist: number
): { isOnPath: boolean; distToCursor: number } {
  const toCursor = {
    x: cursor.x - start.x,
    y: cursor.y - start.y,
  };

  // Project cursor onto ray
  const dotWithDir = toCursor.x * direction.x + toCursor.y * direction.y;

  if (dotWithDir <= 0) {
    return { isOnPath: false, distToCursor: 0 };
  }

  const cursorDist = Math.sqrt(toCursor.x * toCursor.x + toCursor.y * toCursor.y);

  // Check perpendicular distance (is cursor close to the ray?)
  const crossProduct = direction.x * toCursor.y - direction.y * toCursor.x;
  const perpDist = Math.abs(crossProduct);

  // Cursor must be within 1 pixel of ray and before hit
  if (perpDist > 1 || cursorDist > hitDist) {
    return { isOnPath: false, distToCursor: cursorDist };
  }

  return { isOnPath: true, distToCursor: cursorDist };
}

/**
 * Calculate the actual physical path using forward ray casting.
 *
 * FIRST PRINCIPLES:
 * - B1: Forward physics (start from player, ray cast to find hits)
 * - D1: Only on-segment hits cause reflection
 * - D3: This is the path the arrow follows
 *
 * @param player Player position
 * @param cursor Cursor position (path ends here if reached)
 * @param initialDirection Initial shooting direction (normalized)
 * @param allSurfaces All surfaces in the scene
 * @param maxReflections Maximum number of reflections (default 10)
 * @param maxDistance Maximum total path distance (default 2000)
 * @returns ActualPath with waypoints and hit info
 */
export function calculateActualPath(
  player: Vector2,
  cursor: Vector2,
  initialDirection: Vector2,
  allSurfaces: readonly Surface[],
  maxReflections: number = 10,
  maxDistance: number = 2000
): ActualPath {
  const waypoints: Vector2[] = [player];
  const waypointSources: SourcePoint[] = [new OriginPoint(player)];
  const forwardProjection: Vector2[] = [];
  const forwardProjectionSources: SourcePoint[] = [];
  const hits: ActualHit[] = [];

  let currentPoint = player;
  let currentDirection = initialDirection;
  let lastHitSurface: Surface | null = null;
  let remainingDistance = maxDistance;
  let blockedBy: Surface | null = null;
  let cursorIndex = -1;
  let cursorT = 0;
  let reachedCursor = false;
  let afterCursor = false;

  for (let i = 0; i < maxReflections && remainingDistance > 0; i++) {
    // Cast ray forward using unified ray casting
    const excludeSurfaces = lastHitSurface ? [lastHitSurface] : [];
    const hitResult = raycastForwardWithProvenance(
      currentPoint,
      currentDirection,
      allSurfaces,
      excludeSurfaces,
      remainingDistance
    );

    const hitDist = hitResult
      ? distance(currentPoint, hitResult.hitPoint.computeXY())
      : remainingDistance;

    // Check if cursor is on this segment (only if not already past cursor)
    const cursorCheck = !afterCursor 
      ? checkCursorOnRay(currentPoint, currentDirection, cursor, hitDist)
      : { isOnPath: false, distToCursor: 0 };

    if (cursorCheck.isOnPath) {
      // Cursor is on path - add cursor as final waypoint
      waypoints.push(cursor);
      waypointSources.push(new OriginPoint(cursor));
      cursorIndex = waypoints.length - 2;
      cursorT = hitDist > 0 ? cursorCheck.distToCursor / hitDist : 1;
      reachedCursor = true;
      afterCursor = true;

      // Calculate forward projection from cursor
      const projRemaining = remainingDistance - cursorCheck.distToCursor;
      if (projRemaining > 0) {
        calculateForwardProjectionWithProvenance(
          cursor,
          currentDirection,
          allSurfaces,
          lastHitSurface,
          projRemaining,
          maxReflections - i,
          forwardProjection,
          forwardProjectionSources
        );
      }
      break;
    }

    if (!hitResult) {
      // No hit - extend to remaining distance
      const endpoint = {
        x: currentPoint.x + currentDirection.x * remainingDistance,
        y: currentPoint.y + currentDirection.y * remainingDistance,
      };
      if (afterCursor) {
        forwardProjection.push(endpoint);
        forwardProjectionSources.push(new OriginPoint(endpoint));
      } else {
        waypoints.push(endpoint);
        waypointSources.push(new OriginPoint(endpoint));
      }
      break;
    }

    // Add hit point with provenance
    const hitXY = hitResult.hitPoint.computeXY();
    if (afterCursor) {
      forwardProjection.push(hitXY);
      forwardProjectionSources.push(hitResult.hitPoint);
    } else {
      waypoints.push(hitXY);
      waypointSources.push(hitResult.hitPoint);
    }
    remainingDistance -= hitDist;

    if (!hitResult.canReflect) {
      // Wall hit - stop here
      hits.push({
        point: hitXY,
        surface: hitResult.hitPoint.hitSurface,
        reflected: false,
      });
      blockedBy = hitResult.hitPoint.hitSurface;
      break;
    }

    // Reflect and continue
    hits.push({
      point: hitXY,
      surface: hitResult.hitPoint.hitSurface,
      reflected: true,
    });

    currentDirection = reflectDirection(currentDirection, hitResult.hitPoint.hitSurface);
    currentPoint = hitXY;
    lastHitSurface = hitResult.hitPoint.hitSurface;
  }

  return {
    waypoints,
    waypointSources,
    hits,
    cursorIndex,
    cursorT,
    reachedCursor,
    blockedBy,
    forwardProjection,
    forwardProjectionSources,
  };
}

/**
 * Calculate the actual physical path using SurfaceChains.
 *
 * This version uses SurfaceChain[] instead of Surface[],
 * enabling junction handling and unified provenance.
 *
 * @param player Player position
 * @param cursor Cursor position (path ends here if reached)
 * @param initialDirection Initial shooting direction (normalized)
 * @param chains All surface chains in the scene
 * @param maxReflections Maximum number of reflections (default 10)
 * @param maxDistance Maximum total path distance (default 2000)
 * @returns ActualPath with waypoints and hit info
 */
export function calculateActualPathWithChains(
  player: Vector2,
  cursor: Vector2,
  initialDirection: Vector2,
  chains: readonly SurfaceChain[],
  maxReflections: number = 10,
  maxDistance: number = 2000
): ActualPath {
  const allSurfaces = extractSurfacesFromChains(chains);
  return calculateActualPath(
    player,
    cursor,
    initialDirection,
    allSurfaces,
    maxReflections,
    maxDistance
  );
}

/**
 * Calculate forward projection from a point with provenance.
 * Used to continue the path beyond cursor for visualization.
 */
function calculateForwardProjectionWithProvenance(
  start: Vector2,
  direction: Vector2,
  surfaces: readonly Surface[],
  lastHitSurface: Surface | null,
  maxDistance: number,
  maxReflections: number,
  result: Vector2[],
  resultSources: SourcePoint[]
): void {
  let currentPoint = start;
  let currentDirection = direction;
  let excludeSurface = lastHitSurface;
  let remainingDistance = maxDistance;

  for (let i = 0; i < maxReflections && remainingDistance > 0; i++) {
    const excludeSurfaces = excludeSurface ? [excludeSurface] : [];
    const hitResult = raycastForwardWithProvenance(
      currentPoint,
      currentDirection,
      surfaces,
      excludeSurfaces,
      remainingDistance
    );

    if (!hitResult) {
      const endpoint = {
        x: currentPoint.x + currentDirection.x * remainingDistance,
        y: currentPoint.y + currentDirection.y * remainingDistance,
      };
      result.push(endpoint);
      resultSources.push(new OriginPoint(endpoint));
      break;
    }

    const hitXY = hitResult.hitPoint.computeXY();
    result.push(hitXY);
    resultSources.push(hitResult.hitPoint);
    remainingDistance -= distance(currentPoint, hitXY);

    if (!hitResult.canReflect) {
      break;
    }

    currentDirection = reflectDirection(currentDirection, hitResult.hitPoint.hitSurface);
    currentPoint = hitXY;
    excludeSurface = hitResult.hitPoint.hitSurface;
  }
}

/**
 * Get initial direction from player toward cursor image.
 *
 * This helper calculates the initial direction using bidirectional images,
 * which is shared by both planned and actual paths.
 *
 * @param player Player position
 * @param cursorImage Cursor image (after backward reflection through surfaces)
 * @returns Normalized direction vector
 */
export function getInitialDirection(player: Vector2, cursorImage: Vector2): Vector2 {
  const dx = cursorImage.x - player.x;
  const dy = cursorImage.y - player.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len === 0) {
    // Degenerate case - return arbitrary direction
    return { x: 1, y: 0 };
  }

  return { x: dx / len, y: dy / len };
}

