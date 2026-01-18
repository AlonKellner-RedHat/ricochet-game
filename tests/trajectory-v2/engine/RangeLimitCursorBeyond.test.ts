import { describe, it, expect } from "vitest";
import { calculateMergedPath } from "@/trajectory-v2/engine/MergedPathCalculator";
import { calculateFullTrajectory } from "@/trajectory-v2/engine/FullTrajectoryCalculator";
import { createRangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";
import { createReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// Test constants
const PLAYER: Vector2 = { x: 400, y: 300 };
const SMALL_RADIUS = 100; // Small range limit radius

describe("Range Limit with Cursor Beyond Radius", () => {
  describe("cursor outside range limit circle", () => {
    it("should stop trajectory at range limit when cursor is beyond", () => {
      // Cursor is 200 units away from player (beyond the 100-unit radius)
      const cursor: Vector2 = { x: 600, y: 300 };
      const rangeLimitPair = createRangeLimitPair(SMALL_RADIUS, "horizontal");

      const result = calculateMergedPath(
        PLAYER,
        cursor,
        [], // No planned surfaces
        [], // No obstacles
        createReflectionCache(),
        rangeLimitPair
      );

      // The merged path should hit the range limit before reaching cursor
      expect(result.reachedCursor).toBe(false);

      // Should have at least one segment
      expect(result.segments.length).toBeGreaterThan(0);

      // The path should end at R distance from player
      const lastSegment = result.segments[result.segments.length - 1]!;
      const distFromPlayer = Math.sqrt(
        (lastSegment.end.x - PLAYER.x) ** 2 + (lastSegment.end.y - PLAYER.y) ** 2
      );
      expect(distFromPlayer).toBeCloseTo(SMALL_RADIUS, 0);
    });

    it("should not reach cursor when cursor is beyond range limit", () => {
      // Cursor is beyond range limit
      const cursor: Vector2 = { x: 600, y: 300 };
      const rangeLimitPair = createRangeLimitPair(SMALL_RADIUS, "horizontal");

      const result = calculateFullTrajectory(
        PLAYER,
        cursor,
        [], // No planned surfaces
        [], // No obstacles
        createReflectionCache(),
        rangeLimitPair
      );

      // Since cursor is beyond range, trajectory ends at range limit, not cursor
      // Check that the merged segments end at range limit distance
      expect(result.merged.length).toBeGreaterThan(0);
      const lastSegment = result.merged[result.merged.length - 1]!;
      const distFromPlayer = Math.sqrt(
        (lastSegment.end.x - PLAYER.x) ** 2 + (lastSegment.end.y - PLAYER.y) ** 2
      );
      expect(distFromPlayer).toBeCloseTo(SMALL_RADIUS, 0);
    });

    it("should end trajectory at range limit distance from player", () => {
      // Player at origin, cursor far away
      const player: Vector2 = { x: 0, y: 0 };
      const cursor: Vector2 = { x: 500, y: 0 };
      const rangeLimitPair = createRangeLimitPair(100, "horizontal");

      const result = calculateMergedPath(
        player,
        cursor,
        [],
        [], // No walls
        createReflectionCache(),
        rangeLimitPair
      );

      // Should stop at range limit (100 units from player)
      expect(result.reachedCursor).toBe(false);

      expect(result.segments.length).toBeGreaterThan(0);
      const lastSegment = result.segments[result.segments.length - 1]!;
      const distFromPlayer = Math.sqrt(
        lastSegment.end.x ** 2 + lastSegment.end.y ** 2
      );
      // Should be at radius distance
      expect(distFromPlayer).toBeCloseTo(100, 0);
    });
  });

  describe("cursor inside range limit circle", () => {
    it("should reach cursor when cursor is within range limit", () => {
      // Cursor is only 50 units away (within the 100-unit radius)
      const cursor: Vector2 = { x: 450, y: 300 };
      const rangeLimitPair = createRangeLimitPair(SMALL_RADIUS, "horizontal");

      const result = calculateMergedPath(
        PLAYER,
        cursor,
        [],
        [], // No obstacles
        createReflectionCache(),
        rangeLimitPair
      );

      // Cursor should be reached since it's within range
      expect(result.reachedCursor).toBe(true);
    });

    it("should reach cursor and continue to range limit", () => {
      // Cursor within range (50 units away, within 100-unit radius)
      const cursor: Vector2 = { x: 450, y: 300 };
      const rangeLimitPair = createRangeLimitPair(SMALL_RADIUS, "horizontal");

      const result = calculateFullTrajectory(
        PLAYER,
        cursor,
        [],
        [], // No obstacles - continuation should hit range limit
        createReflectionCache(),
        rangeLimitPair
      );

      // Merged segments should exist and continue to range limit
      expect(result.merged.length).toBeGreaterThan(0);

      // Last segment should end at range limit
      const lastSegment = result.merged[result.merged.length - 1]!;
      const distFromPlayer = Math.sqrt(
        (lastSegment.end.x - PLAYER.x) ** 2 +
          (lastSegment.end.y - PLAYER.y) ** 2
      );
      // Should end at range limit
      expect(distFromPlayer).toBeCloseTo(SMALL_RADIUS, 0);
    });
  });
});
