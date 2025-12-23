/**
 * IVisibilityCalculator - Strategy Interface for Visibility Calculation
 *
 * Defines the contract for visibility polygon calculation.
 * Implementations can use different algorithms (angle-based, ray-based, etc.)
 * while maintaining the same interface.
 *
 * First Principle V.5: Light reaches cursor ↔ (plan valid AND aligned)
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";

/**
 * Screen bounds for visibility calculation.
 */
export interface ScreenBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Result of visibility calculation.
 */
export interface VisibilityResult {
  /** Polygon vertices defining the visible region */
  readonly polygon: readonly Vector2[];
  /** Origin point for rendering (may be player image for planned surfaces) */
  readonly origin: Vector2;
  /** Whether the result is valid (has enough vertices for a polygon) */
  readonly isValid: boolean;
}

/**
 * Strategy interface for visibility calculation.
 *
 * Implementations should:
 * 1. Calculate which areas are visible from the player's perspective
 * 2. For planned surfaces, consider reflection through the surface
 * 3. Return a polygon that can be rendered as a visibility mask
 */
export interface IVisibilityCalculator {
  /**
   * Calculate the visibility polygon for a given player position.
   *
   * @param player Player position
   * @param surfaces All surfaces in the scene (obstacles)
   * @param screenBounds Screen boundaries
   * @param plannedSurfaces Ordered planned surfaces (affect visibility region)
   * @returns Visibility result with polygon and metadata
   */
  calculate(
    player: Vector2,
    surfaces: readonly Surface[],
    screenBounds: ScreenBounds,
    plannedSurfaces: readonly Surface[]
  ): VisibilityResult;

  /**
   * Check if a specific cursor position is "lit" (in the visible region).
   *
   * This is the V.5 check: a cursor is lit iff the trajectory from
   * player to cursor (through planned surfaces) is valid and aligned.
   *
   * @param player Player position
   * @param cursor Cursor position to check
   * @param plannedSurfaces Ordered planned surfaces
   * @param allSurfaces All surfaces (for obstruction checking)
   * @returns True if cursor is reachable (should be lit)
   */
  isCursorLit(
    player: Vector2,
    cursor: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[]
  ): boolean;
}

