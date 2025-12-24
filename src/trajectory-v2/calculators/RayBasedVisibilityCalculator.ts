/**
 * RayBasedVisibilityCalculator - Ray-Based Visibility Implementation
 *
 * Uses the ray-based core (ImageChain, RayCore) for visibility calculation,
 * ensuring V.5 correlation: Light reaches cursor ↔ (plan valid AND aligned)
 *
 * First Principles:
 * 1. Visibility derives from ImageChain rays (same as trajectory)
 * 2. A cursor is lit iff its ImageChain shows no divergence
 * 3. No angle calculations - uses ray-segment intersection
 *
 * Now includes the new analytical propagation with intermediate polygons
 * for V.8 and V.9 compliance.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import type {
  IVisibilityCalculator,
  ScreenBounds,
  VisibilityResult,
} from "@/trajectory-v2/interfaces/IVisibilityCalculator";
import {
  calculateRayVisibility,
  isCursorLit as isCursorLitCore,
} from "@/trajectory-v2/visibility/RayBasedVisibility";
import {
  propagateWithIntermediates,
  type PropagationResult,
} from "@/trajectory-v2/visibility/AnalyticalPropagation";

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
   * For planned surfaces, the polygon is built from rays that pass through
   * the "window" defined by each planned surface segment.
   */
  calculate(
    player: Vector2,
    surfaces: readonly Surface[],
    screenBounds: ScreenBounds,
    plannedSurfaces: readonly Surface[]
  ): VisibilityResult {
    const result = calculateRayVisibility(
      player,
      surfaces,
      screenBounds,
      plannedSurfaces
    );

    return {
      polygon: result.polygon,
      origin: result.origin,
      isValid: result.isValid,
    };
  }

  /**
   * Check if cursor is lit using ImageChain-based V.5 check.
   *
   * This is the correct V.5 check: uses the same geometry as trajectory
   * to determine if the cursor is reachable.
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
    return isCursorLitCore(player, cursor, plannedSurfaces, allSurfaces);
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

// Re-export PropagationResult for consumers
export type { PropagationResult };

