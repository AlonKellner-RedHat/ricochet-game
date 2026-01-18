/**
 * RangeLimit - Circular range obstacles that limit trajectory distance.
 *
 * Range limits are:
 * - Centered on the current player image (follows reflections)
 * - Invisible (not rendered)
 * - Two semi-circles (top/bottom or left/right) for future separate behaviors
 *
 * Hit detection logic:
 * 1. Check if ray direction points into one of the semi-circles
 * 2. If start inside circle: hit at distance R from origin in ray direction
 * 3. If start outside circle: hit at start position (immediately blocked)
 */

import type { Vector2, RangeSemiCircle, RangePairOrientation } from "@/trajectory-v2/geometry/types";
import {
  isDirectionInSemiCircle,
  computeRangeLimitHitPoint,
} from "@/trajectory-v2/geometry/RangeLimitOps";

/**
 * Result of a range limit hit.
 */
export interface RangeLimitHit {
  /** Which semi-circle was hit */
  readonly half: RangeLimitHalf;
  /** The hit point */
  readonly point: Vector2;
  /** Whether the ray started inside the circle */
  readonly wasInsideCircle: boolean;
}

/**
 * A single semi-circle of the range limit.
 */
export interface RangeLimitHalf {
  /** Unique identifier */
  readonly id: string;
  /** Which semi-circle this is */
  readonly half: RangeSemiCircle;
  /** Radius of the range limit */
  readonly radius: number;

  /**
   * Check if a ray direction falls within this semi-circle.
   * Uses coordinate sign checks (no atan2) for project rule compliance.
   */
  isDirectionInHalf(direction: Vector2): boolean;

  /**
   * Compute hit point for this semi-circle.
   * @returns Hit result, or null if direction not in this half
   */
  computeHitPoint(
    originImage: Vector2,
    rayDirection: Vector2,
    startPosition: Vector2
  ): RangeLimitHit | null;
}

/**
 * A pair of semi-circles forming a complete range limit.
 */
export interface RangeLimitPair {
  /** First semi-circle (top or left) */
  readonly first: RangeLimitHalf;
  /** Second semi-circle (bottom or right) */
  readonly second: RangeLimitHalf;
  /** Orientation of the pair */
  readonly orientation: RangePairOrientation;
  /** Radius of the range limit */
  readonly radius: number;

  /**
   * Find hit across both halves.
   * @returns Hit result from whichever half matches, or null if neither
   */
  findHit(
    originImage: Vector2,
    rayDirection: Vector2,
    startPosition: Vector2
  ): RangeLimitHit | null;
}

/**
 * Create a single range limit half (semi-circle).
 */
export function createRangeLimitHalf(
  half: RangeSemiCircle,
  radius: number
): RangeLimitHalf {
  const id = `range-limit-${half}`;

  return {
    id,
    half,
    radius,

    isDirectionInHalf(direction: Vector2): boolean {
      return isDirectionInSemiCircle(direction, half);
    },

    computeHitPoint(
      originImage: Vector2,
      rayDirection: Vector2,
      startPosition: Vector2
    ): RangeLimitHit | null {
      // Check if direction is in this half
      if (!this.isDirectionInHalf(rayDirection)) {
        return null;
      }

      // Compute hit point
      const result = computeRangeLimitHitPoint(
        originImage,
        radius,
        rayDirection,
        startPosition
      );

      return {
        half: this,
        point: result.point,
        wasInsideCircle: result.wasInsideCircle,
      };
    },
  };
}

/**
 * Create a range limit pair (two semi-circles).
 *
 * @param radius - Radius of the range limit
 * @param orientation - "horizontal" (top/bottom, default) or "vertical" (left/right)
 */
export function createRangeLimitPair(
  radius: number,
  orientation: RangePairOrientation = "horizontal"
): RangeLimitPair {
  const first = createRangeLimitHalf(
    orientation === "horizontal" ? "top" : "left",
    radius
  );
  const second = createRangeLimitHalf(
    orientation === "horizontal" ? "bottom" : "right",
    radius
  );

  return {
    first,
    second,
    orientation,
    radius,

    findHit(
      originImage: Vector2,
      rayDirection: Vector2,
      startPosition: Vector2
    ): RangeLimitHit | null {
      // Try first half
      const firstHit = first.computeHitPoint(originImage, rayDirection, startPosition);
      if (firstHit) {
        return firstHit;
      }

      // Try second half
      const secondHit = second.computeHitPoint(originImage, rayDirection, startPosition);
      if (secondHit) {
        return secondHit;
      }

      return null;
    },
  };
}
