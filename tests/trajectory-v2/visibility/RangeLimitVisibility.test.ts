/**
 * Tests for Range Limit integration with visibility ray casting.
 *
 * When a visibility ray terminates at the range limit (before hitting any surface),
 * the vertex should be marked with source = "range_limit".
 */

import { describe, it, expect } from "vitest";
import {
  castRayToFirstHitWithSource,
  type HitWithSource,
} from "@/trajectory-v2/visibility/RangeLimitVisibility";
import type { Vector2 } from "@/types";
import type { Surface } from "@/surfaces/Surface";
import type { ScreenBounds } from "@/trajectory-v2/visibility/AnalyticalPropagation";
import { createRangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";

describe("RangeLimitVisibility", () => {
  const bounds: ScreenBounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  const origin: Vector2 = { x: 400, y: 300 };

  // Create a range limit with radius 100
  const rangeLimit = createRangeLimitPair(100, "horizontal");

  describe("castRayToFirstHitWithSource", () => {
    it("should return range_limit source when ray hits range limit before screen", () => {
      // Ray pointing right, no obstacles, range limit at radius 100
      const target: Vector2 = { x: 600, y: 300 }; // Pointing right
      const obstacles: Surface[] = [];

      const result = castRayToFirstHitWithSource(
        origin,
        target,
        obstacles,
        bounds,
        0, // startRatio
        { pair: rangeLimit, center: origin }
      );

      expect(result).not.toBeNull();
      expect(result!.source).toBe("range_limit");
      // Hit should be at radius 100 from origin
      expect(result!.point.x).toBeCloseTo(500); // 400 + 100
      expect(result!.point.y).toBeCloseTo(300);
    });

    it("should return surface source when surface is closer than range limit", () => {
      // Create an obstacle at x=450 (50 pixels from origin, closer than radius 100)
      const wallSurface = createWallSurface(
        { x: 450, y: 200 },
        { x: 450, y: 400 }
      );
      const obstacles: Surface[] = [wallSurface];
      const target: Vector2 = { x: 600, y: 300 };

      const result = castRayToFirstHitWithSource(
        origin,
        target,
        obstacles,
        bounds,
        0,
        { pair: rangeLimit, center: origin }
      );

      expect(result).not.toBeNull();
      expect(result!.source).toBe("surface");
      expect(result!.point.x).toBeCloseTo(450);
      expect(result!.point.y).toBeCloseTo(300);
    });

    it("should return screen source when screen is closer than range limit", () => {
      // Large range limit that extends beyond screen
      const largeRangeLimit = createRangeLimitPair(1000, "horizontal");
      const target: Vector2 = { x: 1000, y: 300 }; // Pointing right toward screen edge
      const obstacles: Surface[] = [];

      const result = castRayToFirstHitWithSource(
        origin,
        target,
        obstacles,
        bounds,
        0,
        { pair: largeRangeLimit, center: origin }
      );

      expect(result).not.toBeNull();
      expect(result!.source).toBe("screen");
      expect(result!.point.x).toBeCloseTo(800); // Screen edge at maxX
    });

    it("should return screen source when no range limit is provided", () => {
      const target: Vector2 = { x: 1000, y: 300 };
      const obstacles: Surface[] = [];

      const result = castRayToFirstHitWithSource(
        origin,
        target,
        obstacles,
        bounds,
        0,
        undefined // No range limit
      );

      expect(result).not.toBeNull();
      expect(result!.source).toBe("screen");
    });

    it("should work with diagonal directions", () => {
      const target: Vector2 = { x: 500, y: 200 }; // Up-right
      const obstacles: Surface[] = [];

      const result = castRayToFirstHitWithSource(
        origin,
        target,
        obstacles,
        bounds,
        0,
        { pair: rangeLimit, center: origin }
      );

      expect(result).not.toBeNull();
      expect(result!.source).toBe("range_limit");
      // Distance from origin to hit should be 100
      const dx = result!.point.x - origin.x;
      const dy = result!.point.y - origin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      expect(dist).toBeCloseTo(100);
    });
  });
});

/**
 * Helper to create a wall surface for testing.
 */
function createWallSurface(start: Vector2, end: Vector2): Surface {
  return {
    id: `wall-${start.x}-${start.y}`,
    type: "wall",
    segment: { start, end },
    canReflect: () => false,
    isBlocking: () => true,
    getVisualProperties: () => ({ color: 0x808080, lineWidth: 2, alpha: 1 }),
  };
}
