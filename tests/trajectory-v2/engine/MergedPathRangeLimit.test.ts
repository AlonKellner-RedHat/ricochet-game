/**
 * Tests for MergedPathCalculator with Range Limit.
 *
 * TDD: Tests written first, then implementation.
 */

import { describe, it, expect } from "vitest";
import { calculateMergedPath } from "@/trajectory-v2/engine/MergedPathCalculator";
import { createReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import { createRangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";

describe("MergedPath with Range Limit", () => {
  describe("trajectory limiting", () => {
    it("should stop trajectory at range limit when cursor is beyond", () => {
      const player = { x: 400, y: 300 };
      const cursor = { x: 1000, y: 300 }; // 600px away, beyond 480px limit
      const rangeLimitPair = createRangeLimitPair(480);
      
      const result = calculateMergedPath(
        player,
        cursor,
        [], // no planned surfaces
        [], // no obstacles
        createReflectionCache(),
        rangeLimitPair
      );
      
      // Should have at least one segment
      expect(result.segments.length).toBeGreaterThan(0);
      
      // Last point should be at range limit distance (480px from player)
      const lastSegment = result.segments[result.segments.length - 1];
      const dist = Math.sqrt(
        (lastSegment.end.x - player.x) ** 2 + 
        (lastSegment.end.y - player.y) ** 2
      );
      expect(dist).toBeCloseTo(480, 0);
    });

    it("should reach cursor when cursor is within range, then continue to range limit", () => {
      const player = { x: 400, y: 300 };
      const cursor = { x: 600, y: 300 }; // 200px away, within 480px limit
      const rangeLimitPair = createRangeLimitPair(480);
      
      const result = calculateMergedPath(
        player,
        cursor,
        [],
        [],
        createReflectionCache(),
        rangeLimitPair
      );
      
      // Should reach cursor (reachedCursor flag)
      expect(result.reachedCursor).toBe(true);
      
      // Trajectory continues past cursor to range limit
      // Last segment ends at range limit (480px from player)
      const lastSegment = result.segments[result.segments.length - 1];
      const dist = Math.sqrt(
        (lastSegment.end.x - player.x) ** 2 + 
        (lastSegment.end.y - player.y) ** 2
      );
      expect(dist).toBeCloseTo(480, 0);
    });

    it("should work with diagonal directions", () => {
      const player = { x: 400, y: 300 };
      // Cursor at 45 degrees, distance = sqrt(500^2 + 500^2) ≈ 707px
      const cursor = { x: 900, y: 800 };
      const rangeLimitPair = createRangeLimitPair(480);
      
      const result = calculateMergedPath(
        player,
        cursor,
        [],
        [],
        createReflectionCache(),
        rangeLimitPair
      );
      
      // Last point should be at range limit distance
      const lastSegment = result.segments[result.segments.length - 1];
      const dist = Math.sqrt(
        (lastSegment.end.x - player.x) ** 2 + 
        (lastSegment.end.y - player.y) ** 2
      );
      expect(dist).toBeCloseTo(480, 0);
    });

    it("should work without range limit (backward compatible)", () => {
      const player = { x: 400, y: 300 };
      const cursor = { x: 1000, y: 300 }; // 600px away
      
      // No rangeLimitPair passed - should reach cursor
      const result = calculateMergedPath(
        player,
        cursor,
        [],
        [],
        createReflectionCache()
        // No rangeLimitPair
      );
      
      // Trajectory should reach cursor (no range limit)
      const lastSegment = result.segments[result.segments.length - 1];
      expect(lastSegment.end.x).toBeCloseTo(1000);
      expect(lastSegment.end.y).toBeCloseTo(300);
    });
  });
});
