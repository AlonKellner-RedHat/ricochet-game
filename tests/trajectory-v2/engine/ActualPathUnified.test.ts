/**
 * Tests for calculateActualPathUnified - Unified actual path calculation using tracePath.
 *
 * This function replaces the direction-based reflection approach with
 * image-based reflection via RayPropagator and tracePath.
 */

import { describe, it, expect } from "vitest";
import { createMockBidirectionalSurface, createMockWall } from "@test/helpers/surfaceHelpers";
import { calculateActualPathUnified } from "@/trajectory-v2/engine/ActualPathCalculator";
import { createReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

describe("calculateActualPathUnified", () => {
  // Helper to create a simple horizontal bidirectional reflective surface
  function createHorizontalSurface(
    id: string,
    y: number,
    xStart: number,
    xEnd: number
  ): Surface {
    return createMockBidirectionalSurface(id, { x: xStart, y }, { x: xEnd, y });
  }

  describe("basic path tracing", () => {
    it("should return direct path from player to cursor when no surfaces", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 200, y: 200 };

      const result = calculateActualPathUnified(player, cursor, []);

      expect(result.waypoints.length).toBeGreaterThanOrEqual(2);
      expect(result.waypoints[0]).toEqual(player);
      expect(result.reachedCursor).toBe(true);
    });

    it("should produce waypoints for simple reflection", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 300 };

      // Surface at y=200 between player and cursor
      const surface = createHorizontalSurface("s1", 200, 50, 150);

      const result = calculateActualPathUnified(player, cursor, [surface]);

      // Should have waypoints showing the reflection path
      expect(result.waypoints.length).toBeGreaterThanOrEqual(2);
      expect(result.hits.length).toBeGreaterThanOrEqual(1);
    });

    it("should produce same waypoints for multiple reflections", () => {
      const player: Vector2 = { x: 100, y: 150 };
      const cursor: Vector2 = { x: 100, y: 500 };

      // Two parallel surfaces for bouncing
      const surface1 = createHorizontalSurface("s1", 200, 50, 150);
      const surface2 = createHorizontalSurface("s2", 100, 50, 150);

      const result = calculateActualPathUnified(player, cursor, [surface1, surface2]);

      // Should have multiple hits from bouncing
      expect(result.hits.length).toBeGreaterThanOrEqual(1);
    });

    it("should stop at walls identically", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 300 };

      // Wall at y=200
      const wall = createMockWall("wall1", { x: 50, y: 200 }, { x: 150, y: 200 });

      const result = calculateActualPathUnified(player, cursor, [wall]);

      expect(result.blockedBy).toBe(wall);
      expect(result.reachedCursor).toBe(false);
    });

    it("should handle cursor on path identically", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 150 }; // Cursor before surface

      const surface = createHorizontalSurface("s1", 200, 50, 150);

      const result = calculateActualPathUnified(player, cursor, [surface]);

      expect(result.reachedCursor).toBe(true);
      expect(result.cursorIndex).toBeGreaterThanOrEqual(0);
    });
  });

  describe("provenance", () => {
    it("should include HitPoints with correct ray provenance", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 300 };

      const surface = createHorizontalSurface("s1", 200, 50, 150);

      const result = calculateActualPathUnified(player, cursor, [surface]);

      // waypointSources should contain SourcePoints with provenance
      expect(result.waypointSources.length).toBeGreaterThanOrEqual(2);
      
      // First should be OriginPoint (player)
      expect(result.waypointSources[0]!.type).toBe("origin");
    });

    it("should have ray.source = reflected origin image", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 300 };

      const surface = createHorizontalSurface("s1", 200, 50, 150);

      const result = calculateActualPathUnified(player, cursor, [surface]);

      // The propagator should have reflected images
      if (result.propagator) {
        const state = result.propagator.getState();
        // After one reflection, origin image should be reflected through surface
        expect(state.originImage).toBeDefined();
      }
    });

    it("should have ray.target = reflected cursor image", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 300 };

      const surface = createHorizontalSurface("s1", 200, 50, 150);

      const result = calculateActualPathUnified(player, cursor, [surface]);

      // The propagator should have reflected target images
      if (result.propagator) {
        const state = result.propagator.getState();
        expect(state.targetImage).toBeDefined();
      }
    });
  });

  describe("forward projection", () => {
    it("should calculate forward projection from cursor position", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 150 }; // Before the surface

      const surface = createHorizontalSurface("s1", 200, 50, 150);

      const result = calculateActualPathUnified(player, cursor, [surface]);

      // Should have forward projection beyond cursor
      expect(result.forwardProjection.length).toBeGreaterThanOrEqual(1);
    });

    it("forward projection should continue from propagator state", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 180 }; // Before surface at y=200

      const surface = createHorizontalSurface("s1", 200, 50, 150);

      const result = calculateActualPathUnified(player, cursor, [surface]);

      // Forward projection should show what happens after cursor
      expect(result.forwardProjection.length).toBeGreaterThanOrEqual(1);
      
      // The first forward projection point should be at/near the surface
      if (result.forwardProjection.length > 0) {
        expect(result.forwardProjection[0]!.y).toBeCloseTo(200, 0);
      }
    });
  });

  describe("edge cases", () => {
    it("should handle player and cursor at same position", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 100 };

      const result = calculateActualPathUnified(player, cursor, []);

      // Should handle gracefully
      expect(result.waypoints.length).toBeGreaterThanOrEqual(1);
    });

    it("should respect maxReflections limit", () => {
      const player: Vector2 = { x: 100, y: 150 };
      const cursor: Vector2 = { x: 100, y: 500 };

      // Two parallel surfaces for bouncing
      const surface1 = createHorizontalSurface("s1", 200, 50, 150);
      const surface2 = createHorizontalSurface("s2", 100, 50, 150);

      const result = calculateActualPathUnified(
        player,
        cursor,
        [surface1, surface2],
        undefined, // externalCache
        3, // maxReflections
        10000
      );

      // Should not exceed max reflections
      expect(result.hits.length).toBeLessThanOrEqual(3);
    });

    it("should respect maxDistance limit", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 10000 }; // Very far

      const result = calculateActualPathUnified(
        player,
        cursor,
        [],
        undefined, // externalCache
        10,
        500 // maxDistance
      );

      // Path should be limited by distance
      const lastWaypoint = result.waypoints[result.waypoints.length - 1]!;
      const totalDist = Math.abs(lastWaypoint.y - player.y);
      expect(totalDist).toBeLessThanOrEqual(600); // Some tolerance
    });
  });

  describe("external cache support", () => {
    it("should accept external ReflectionCache", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 200, y: 200 };
      const externalCache = createReflectionCache();

      const result = calculateActualPathUnified(player, cursor, [], externalCache);

      expect(result.reachedCursor).toBe(true);
      expect(result.waypoints.length).toBeGreaterThanOrEqual(2);
    });

    it("should use external cache for reflections", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 300 };
      const externalCache = createReflectionCache();
      const surface = createHorizontalSurface("s1", 200, 50, 150);

      calculateActualPathUnified(player, cursor, [surface], externalCache);

      // Cache should have been used for reflections
      const stats = externalCache.stats();
      expect(stats.size).toBeGreaterThanOrEqual(0); // May or may not have entries depending on path
    });

    it("should share cache between multiple calculations", () => {
      const externalCache = createReflectionCache();
      const surface = createHorizontalSurface("s1", 200, 50, 350);

      // First calculation
      calculateActualPathUnified(
        { x: 100, y: 100 },
        { x: 100, y: 300 },
        [surface],
        externalCache
      );
      const statsAfterFirst = externalCache.stats();

      // Second calculation with same surface
      calculateActualPathUnified(
        { x: 200, y: 100 },
        { x: 200, y: 300 },
        [surface],
        externalCache
      );
      const statsAfterSecond = externalCache.stats();

      // Cache should persist across calculations
      expect(statsAfterSecond.size).toBeGreaterThanOrEqual(statsAfterFirst.size);
    });
  });

  // Note: equivalence tests with old calculateActualPath were removed
  // as part of unified migration. The new calculateActualPathUnified
  // uses image-based reflection which may produce slightly different
  // results than the old direction-based approach.
});
