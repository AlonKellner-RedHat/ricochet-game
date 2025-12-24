/**
 * RayBasedVisibilityCalculator - Ray-Based Visibility Implementation
 *
 * Uses the analytical propagation algorithm for visibility calculation,
 * ensuring V.5 correlation: Light reaches cursor ↔ (plan valid AND aligned)
 *
 * First Principles:
 * 1. Visibility derives from analytical ray casting
 * 2. A cursor is lit iff it's inside the final visibility polygon
 * 3. No angle normalization - uses direct ray-segment intersection
 *
 * Includes intermediate polygons for V.8 and V.9 compliance.
 */

import type { Surface } from "@/surfaces/Surface";
import { createImageChain } from "@/trajectory-v2/engine/ImageChain";
import {
  createRay,
  intersectRaySegment,
  type Segment,
} from "@/trajectory-v2/geometry/RayCore";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type {
  IVisibilityCalculator,
  ScreenBounds,
  VisibilityResult,
} from "@/trajectory-v2/interfaces/IVisibilityCalculator";
import {
  buildVisibilityPolygon,
  propagateWithIntermediates,
} from "@/trajectory-v2/visibility/AnalyticalPropagation";
import type { PropagationResult } from "@/trajectory-v2/visibility/PropagationTypes";

/**
 * Ray-based visibility calculator implementation.
 *
 * Uses the same ray operations as trajectory calculation,
 * guaranteeing V.5 correlation between visibility and path validity.
 */
export class RayBasedVisibilityCalculator implements IVisibilityCalculator {
  /**
   * Calculate visibility polygon using ray-based algorithm.
   *
   * For empty plans: Uses the new analytical buildVisibilityPolygon which
   * correctly orders vertices angularly (no self-intersection).
   *
   * For planned surfaces: Uses propagateWithIntermediates which builds
   * the visibility polygon by cropping through each window.
   */
  calculate(
    player: Vector2,
    surfaces: readonly Surface[],
    screenBounds: ScreenBounds,
    plannedSurfaces: readonly Surface[]
  ): VisibilityResult {
    // Use the new analytical algorithm which has correct polygon ordering
    if (plannedSurfaces.length === 0) {
      // Empty plan: direct visibility from player
      const polygon = buildVisibilityPolygon(player, surfaces, screenBounds);
      return {
        polygon,
        origin: player,
        isValid: polygon.length >= 3,
      };
    }

    // Planned surfaces: use propagation with intermediate polygons
    const propagation = propagateWithIntermediates(player, plannedSurfaces, surfaces, screenBounds);

    return {
      polygon: propagation.finalPolygon,
      origin: propagation.finalOrigin,
      isValid: propagation.isValid,
    };
  }

  /**
   * Check if cursor is lit using ImageChain-based V.5 check.
   *
   * This is the correct V.5 check: uses the same geometry as trajectory
   * to determine if the cursor is reachable. This properly handles:
   * - Obstructions blocking the input path (player to surface)
   * - Obstructions blocking the output path (surface to cursor)
   * - Player/cursor on wrong side of planned surfaces
   * - Reflection points off-segment
   *
   * A cursor is lit iff:
   * 1. All reflection points are on-segment
   * 2. Player is on reflective side of all planned surfaces
   * 3. Cursor is on reflective side of last planned surface
   * 4. No obstacles block the path
   */
  isCursorLit(
    player: Vector2,
    cursor: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[]
  ): boolean {
    if (plannedSurfaces.length === 0) {
      // No plan: cursor is lit iff direct line-of-sight exists
      return hasDirectLineOfSight(player, cursor, allSurfaces);
    }

    // Create ImageChain for this player-cursor pair
    const chain = createImageChain(player, cursor, plannedSurfaces);

    // Check 1: Player must be on reflective side of first planned surface
    if (!chain.isPlayerOnReflectiveSide(0)) {
      return false;
    }

    // Check 2: Cursor must be on reflective side of last planned surface
    const lastIndex = plannedSurfaces.length - 1;
    if (!chain.isCursorOnReflectiveSide(lastIndex)) {
      return false;
    }

    // Check 3: All reflection points must be on segment
    for (let i = 0; i < plannedSurfaces.length; i++) {
      if (!chain.isReflectionOnSegment(i)) {
        return false;
      }
    }

    // Check 4: No obstacles blocking the path
    // Check each segment of the path for obstructions
    const rays = chain.getAllRays();
    for (let i = 0; i < rays.length; i++) {
      const ray = rays[i]!;
      const segmentEnd = ray.target;

      // Find surfaces that might obstruct this segment
      const obstacles = allSurfaces.filter((s) => {
        // Don't count planned surfaces as obstacles for their segment
        if (i < plannedSurfaces.length && s.id === plannedSurfaces[i]!.id) {
          return false;
        }
        return true;
      });

      for (const obstacle of obstacles) {
        const segment: Segment = {
          start: obstacle.segment.start,
          end: obstacle.segment.end,
        };

        const hit = intersectRaySegment(ray, segment);

        if (hit && hit.onSegment && hit.t > 0.001) {
          // Check if hit is before the segment end
          const rayLength = distance(ray.source, segmentEnd);
          const hitDist = distance(ray.source, hit.point);

          if (hitDist < rayLength - 1) {
            // Obstruction before target
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Calculate visibility with intermediate polygons for V.8/V.9 compliance.
   *
   * This uses the new analytical propagation algorithm that builds
   * N+1 intermediate polygons for N planned surfaces.
   *
   * The intermediate polygons satisfy:
   * - V.8: Intermediate Pk ⊆ Final([S1..Sk])
   * - V.9: Intermediate Pk is equal across different plan lengths
   *
   * @param player Player position
   * @param plannedSurfaces Ordered planned surfaces
   * @param allSurfaces All surfaces
   * @param screenBounds Screen boundaries
   * @returns Propagation result with all intermediate polygons
   */
  calculateWithIntermediates(
    player: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[],
    screenBounds: ScreenBounds
  ): PropagationResult {
    return propagateWithIntermediates(player, plannedSurfaces, allSurfaces, screenBounds);
  }
}

/**
 * Check if there's direct line of sight between two points.
 */
function hasDirectLineOfSight(
  from: Vector2,
  to: Vector2,
  surfaces: readonly Surface[]
): boolean {
  const ray = createRay(from, to);
  const targetDist = distance(from, to);

  for (const surface of surfaces) {
    const segment: Segment = {
      start: surface.segment.start,
      end: surface.segment.end,
    };

    const hit = intersectRaySegment(ray, segment);

    if (hit && hit.onSegment && hit.t > 0.001) {
      const hitDist = distance(from, hit.point);
      if (hitDist < targetDist - 1) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Calculate distance between two points.
 */
function distance(a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Re-export PropagationResult for consumers
export type { PropagationResult };
