/**
 * @deprecated This class is deprecated. Use RayBasedVisibilityCalculator instead.
 *
 * AngleBasedVisibilityCalculator - Adapter for Legacy Visibility Implementation
 *
 * DEPRECATED: This class wraps the deprecated calculateSimpleVisibility() function.
 * It is kept only for backward compatibility.
 *
 * Use instead:
 * - RayBasedVisibilityCalculator (default, uses new analytical algorithm)
 *
 * The new algorithm provides:
 * - Correct polygon ordering (no self-intersection)
 * - Intermediate polygons for V.8/V.9 compliance
 * - Better performance and simpler code
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import type {
  IVisibilityCalculator,
  ScreenBounds,
  VisibilityResult,
} from "@/trajectory-v2/interfaces/IVisibilityCalculator";
import { calculateSimpleVisibility } from "@/trajectory-v2/visibility/SimpleVisibilityCalculator";

/**
 * Adapter that wraps the angle-based visibility calculation.
 *
 * This is the existing implementation that uses:
 * - Angle-based ray casting
 * - Section propagation for planned surfaces
 * - atan2 for angle calculations
 */
export class AngleBasedVisibilityCalculator implements IVisibilityCalculator {
  /**
   * Calculate visibility polygon using the existing angle-based algorithm.
   */
  calculate(
    player: Vector2,
    surfaces: readonly Surface[],
    screenBounds: ScreenBounds,
    plannedSurfaces: readonly Surface[]
  ): VisibilityResult {
    const result = calculateSimpleVisibility(
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
   * Check if cursor is lit using point-in-polygon test.
   *
   * Note: This is a geometric check, not the V.5-correct check.
   * For proper V.5 correlation, use RayBasedVisibilityCalculator.
   */
  isCursorLit(
    player: Vector2,
    cursor: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[]
  ): boolean {
    // For angle-based, we calculate the visibility polygon and check containment
    // This is an approximation - the polygon might not be pixel-perfect
    const screenBounds: ScreenBounds = {
      minX: 0,
      minY: 0,
      maxX: 1280,
      maxY: 720,
    };

    const result = this.calculate(player, allSurfaces, screenBounds, plannedSurfaces);

    if (!result.isValid || result.polygon.length < 3) {
      return false;
    }

    return isPointInPolygon(cursor, result.polygon);
  }
}

/**
 * Check if a point is inside a polygon using ray casting algorithm.
 */
function isPointInPolygon(point: Vector2, polygon: readonly Vector2[]): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i]!.x;
    const yi = polygon[i]!.y;
    const xj = polygon[j]!.x;
    const yj = polygon[j]!.y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

