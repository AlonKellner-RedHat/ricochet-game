/**
 * ActualPathCalculator - Calculates the physical trajectory using forward physics
 *
 * UNIFIED ARCHITECTURE: Uses image-based reflection via RayPropagator
 * for consistency with visibility system and planned path calculations.
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
 * - Uses RayPropagator for image-based reflection
 * - Uses ReflectionCache for memoization (shared with visibility system)
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  OriginPoint,
  HitPoint,
  type SourcePoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import type { ReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import { createRayPropagator, type RayPropagator } from "./RayPropagator";
import { tracePath, traceWithStrategy } from "./TracePath";
import { createPhysicalStrategy } from "./HitDetectionStrategy";

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

/**
 * Extended ActualPath interface that includes the propagator state.
 * This allows continuation of the path for forward projection.
 */
export interface ActualPathUnified extends ActualPath {
  /** The propagator state after tracing (for continuation/projection) */
  readonly propagator?: RayPropagator;
}

/**
 * Calculate the actual physical path using the unified tracePath function.
 *
 * This implementation uses image-based reflection via RayPropagator,
 * ensuring consistency with the planned path calculation.
 *
 * ADVANTAGES over direction-based approach:
 * - Consistent reflection paradigm with planned paths
 * - Propagator state can be used for continuation (forward projection)
 * - Memoized reflections via shared ReflectionCache
 *
 * @param player Player position
 * @param cursor Cursor position (path ends here if reached)
 * @param allSurfaces All surfaces in the scene
 * @param externalCache Optional external ReflectionCache for sharing with other systems
 * @param maxReflections Maximum number of reflections (default 10)
 * @param maxDistance Maximum total path distance (default 2000)
 * @returns ActualPathUnified with waypoints, hit info, and propagator state
 */
export function calculateActualPathUnified(
  player: Vector2,
  cursor: Vector2,
  allSurfaces: readonly Surface[],
  externalCache?: ReflectionCache,
  maxReflections: number = 10,
  maxDistance: number = 2000
): ActualPathUnified {
  // Handle degenerate case where player and cursor are the same
  if (player.x === cursor.x && player.y === cursor.y) {
    return {
      waypoints: [player],
      waypointSources: [new OriginPoint(player)],
      hits: [],
      cursorIndex: 0,
      cursorT: 0,
      reachedCursor: true,
      blockedBy: null,
      forwardProjection: [],
      forwardProjectionSources: [],
      propagator: createRayPropagator(player, cursor, externalCache),
    };
  }

  // Create initial propagator from player to cursor
  // Use external cache if provided for sharing with other systems (e.g., visibility)
  const propagator = createRayPropagator(player, cursor, externalCache);

  // Trace path to cursor
  const toCursorResult = tracePath(propagator, allSurfaces, {
    mode: "physical",
    stopAtCursor: cursor,
    maxReflections,
    maxDistance,
  });

  // Convert TraceResult to ActualPath format
  const waypoints: Vector2[] = [];
  const waypointSources: SourcePoint[] = [];
  const hits: ActualHit[] = [];

  // Add player as first waypoint
  waypoints.push(player);
  waypointSources.push(new OriginPoint(player));

  // Add segments from trace result
  for (const segment of toCursorResult.segments) {
    // Add end point of each segment
    waypoints.push(segment.end);

    // Create appropriate SourcePoint based on whether there was a surface hit
    if (segment.surface) {
      // This is a hit point - create HitPoint for provenance
      const ray = {
        source: segment.start,
        target: segment.end,
      };
      // Calculate t (always 1.0 since end is the hit point)
      // Calculate s (position on surface) - approximate as 0.5 since we don't have exact info
      waypointSources.push(new HitPoint(ray, segment.surface, 1.0, 0.5));

      hits.push({
        point: segment.end,
        surface: segment.surface,
        reflected: segment.canReflect,
      });
    } else {
      waypointSources.push(new OriginPoint(segment.end));
    }
  }

  // Determine termination state
  const reachedCursor = toCursorResult.terminationType === "cursor";
  const blockedBy = toCursorResult.terminationType === "wall"
    ? (toCursorResult.segments[toCursorResult.segments.length - 1]?.surface ?? null)
    : null;

  // Calculate forward projection if cursor was reached
  let forwardProjection: Vector2[] = [];
  let forwardProjectionSources: SourcePoint[] = [];

  if (reachedCursor) {
    // Continue from cursor using the SAME propagator with continueFromPosition.
    // This uses the unified approach - same origin/target images, just start from cursor.
    const physicalStrategy = createPhysicalStrategy(allSurfaces);
    const forwardResult = traceWithStrategy(toCursorResult.propagator, physicalStrategy, {
      continueFromPosition: cursor,
      maxReflections: maxReflections - toCursorResult.segments.length,
      maxDistance,
    });

    // Convert forward projection segments
    for (const segment of forwardResult.segments) {
      forwardProjection.push(segment.end);

      if (segment.surface) {
        const ray = {
          source: segment.start,
          target: segment.end,
        };
        forwardProjectionSources.push(new HitPoint(ray, segment.surface, 1.0, 0.5));
      } else {
        forwardProjectionSources.push(new OriginPoint(segment.end));
      }
    }
  }

  return {
    waypoints,
    waypointSources,
    hits,
    cursorIndex: toCursorResult.cursorSegmentIndex,
    cursorT: toCursorResult.cursorT,
    reachedCursor,
    blockedBy,
    forwardProjection,
    forwardProjectionSources,
    propagator: toCursorResult.propagator,
  };
}
