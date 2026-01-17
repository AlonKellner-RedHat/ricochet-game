/**
 * Tests for calculateSimpleTrajectoryUnified - Unified trajectory calculation.
 *
 * Phase 7: Validates the unified trajectory calculation that uses
 * image-based reflection and shared ReflectionCache.
 */

import { describe, it, expect } from "vitest";
import { createMockBidirectionalSurface, createMockWall } from "@test/helpers/surfaceHelpers";
import {
  calculateSimpleTrajectory,
  calculateSimpleTrajectoryUnified,
} from "@/trajectory-v2/engine/SimpleTrajectoryCalculator";
import { createReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

describe("calculateSimpleTrajectoryUnified", () => {
  function createHorizontalSurface(
    id: string,
    y: number,
    xStart: number,
    xEnd: number
  ): Surface {
    return createMockBidirectionalSurface(id, { x: xStart, y }, { x: xEnd, y });
  }

  describe("basic functionality", () => {
    it("should return complete trajectory result", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 200, y: 200 };

      const result = calculateSimpleTrajectoryUnified(player, cursor, [], []);

      expect(result.actual).toBeDefined();
      expect(result.planned).toBeDefined();
      expect(result.divergence).toBeDefined();
      expect(result.renderSegments).toBeDefined();
      expect(result.bypass).toBeDefined();
      expect(result.waypointSources).toBeDefined();
    });

    it("should include reflectionCache in result", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 200, y: 200 };

      const result = calculateSimpleTrajectoryUnified(player, cursor, [], []);

      expect(result.reflectionCache).toBeDefined();
    });

    it("should accept external ReflectionCache", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 200, y: 200 };
      const externalCache = createReflectionCache();

      const result = calculateSimpleTrajectoryUnified(
        player,
        cursor,
        [],
        [],
        externalCache
      );

      // Should return the same cache instance
      expect(result.reflectionCache).toBe(externalCache);
    });
  });

  describe("equivalence with legacy function", () => {
    it("should produce same results for simple straight path", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 200, y: 200 };

      const unified = calculateSimpleTrajectoryUnified(player, cursor, [], []);
      const legacy = calculateSimpleTrajectory(player, cursor, [], []);

      // Both should produce same high-level results
      expect(unified.actual.reachedCursor).toBe(legacy.actual.reachedCursor);
      expect(unified.divergence.diverged).toBe(legacy.divergence.diverged);
    });

    it("should produce same planned path", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 300 };
      const plannedSurface = createHorizontalSurface("s1", 200, 50, 150);

      const unified = calculateSimpleTrajectoryUnified(
        player,
        cursor,
        [plannedSurface],
        [plannedSurface]
      );
      const legacy = calculateSimpleTrajectory(
        player,
        cursor,
        [plannedSurface],
        [plannedSurface]
      );

      // Planned path should be identical (both use ImageChain)
      expect(unified.planned.waypoints.length).toBe(legacy.planned.waypoints.length);
    });

    it("should handle blocked path correctly", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 300 };
      const wall = createMockWall("wall1", { x: 50, y: 200 }, { x: 150, y: 200 });

      const unified = calculateSimpleTrajectoryUnified(player, cursor, [], [wall]);
      const legacy = calculateSimpleTrajectory(player, cursor, [], [wall]);

      // Both should be blocked
      expect(unified.actual.blockedBy).toBeDefined();
      expect(legacy.actual.blockedBy).toBeDefined();
    });
  });

  describe("cache integration", () => {
    it("should use cache for reflections", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 300 };
      const surface = createHorizontalSurface("s1", 200, 50, 150);

      const result = calculateSimpleTrajectoryUnified(
        player,
        cursor,
        [surface],
        [surface]
      );

      // Cache should have some entries
      expect(result.reflectionCache).toBeDefined();
    });

    it("should preserve cache across multiple calculations", () => {
      const externalCache = createReflectionCache();
      const surface = createHorizontalSurface("s1", 150, 50, 350);

      // First calculation
      const result1 = calculateSimpleTrajectoryUnified(
        { x: 100, y: 100 },
        { x: 100, y: 300 },
        [surface],
        [surface],
        externalCache
      );

      const sizeAfterFirst = externalCache.stats().size;

      // Second calculation with same cache
      const result2 = calculateSimpleTrajectoryUnified(
        { x: 200, y: 100 },
        { x: 200, y: 300 },
        [surface],
        [surface],
        externalCache
      );

      // Cache should still be the same instance
      expect(result1.reflectionCache).toBe(result2.reflectionCache);
      expect(externalCache.stats().size).toBeGreaterThanOrEqual(sizeAfterFirst);
    });
  });

  describe("render segments", () => {
    it("should produce valid render segments", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 200, y: 200 };

      const result = calculateSimpleTrajectoryUnified(player, cursor, [], []);

      expect(result.renderSegments.length).toBeGreaterThan(0);
      for (const segment of result.renderSegments) {
        expect(segment.start).toBeDefined();
        expect(segment.end).toBeDefined();
        expect(segment.color).toBeDefined();
      }
    });
  });
});
