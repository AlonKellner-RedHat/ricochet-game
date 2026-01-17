/**
 * Tests for TrajectoryEngine unified path integration.
 *
 * Phase 9: Validates that TrajectoryEngine uses the unified actual path
 * calculation with shared ReflectionCache.
 */

import { describe, it, expect } from "vitest";
import { createMockBidirectionalSurface, createMockWall } from "@test/helpers/surfaceHelpers";
import { TrajectoryEngine } from "@/trajectory-v2/engine/TrajectoryEngine";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

describe("TrajectoryEngine Unified Path", () => {
  function createHorizontalSurface(
    id: string,
    y: number,
    xStart: number,
    xEnd: number
  ): Surface {
    return createMockBidirectionalSurface(id, { x: xStart, y }, { x: xEnd, y });
  }

  describe("actualPathUnified caching", () => {
    it("should include actualPathUnified in engine results", () => {
      const engine = new TrajectoryEngine();
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 200, y: 200 };

      engine.setPlayer(player);
      engine.setCursor(cursor);
      engine.setAllSurfaces([]);

      const results = engine.getResults();

      expect(results.actualPathUnified).toBeDefined();
      expect(results.actualPathUnified?.waypoints.length).toBeGreaterThanOrEqual(2);
    });

    it("should share ReflectionCache between actualPathUnified and visibility", () => {
      const engine = new TrajectoryEngine();
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 200, y: 200 };
      const surface = createHorizontalSurface("s1", 150, 50, 250);

      engine.setPlayer(player);
      engine.setCursor(cursor);
      engine.setPlannedSurfaces([surface]);
      engine.setAllSurfaces([surface]);

      const results = engine.getResults();

      // Both actualPathUnified and reflectionCache should be present
      expect(results.actualPathUnified).toBeDefined();
      expect(results.reflectionCache).toBeDefined();
    });

    it("should produce consistent waypoints for arrow system", () => {
      const engine = new TrajectoryEngine();
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 200, y: 200 };

      engine.setPlayer(player);
      engine.setCursor(cursor);
      engine.setAllSurfaces([]);

      const results = engine.getResults();

      // Waypoints should start at player
      expect(results.actualPathUnified?.waypoints[0]).toEqual(player);

      // Should have waypointSources with provenance
      expect(results.actualPathUnified?.waypointSources.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("unified path with reflections", () => {
    it("should handle reflective surfaces", () => {
      const engine = new TrajectoryEngine();
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 300 };
      const surface = createHorizontalSurface("s1", 200, 50, 150);

      engine.setPlayer(player);
      engine.setCursor(cursor);
      engine.setAllSurfaces([surface]);

      const results = engine.getResults();

      // Should have reflection
      expect(results.actualPathUnified).toBeDefined();
      expect(results.actualPathUnified!.hits.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle blocking walls", () => {
      const engine = new TrajectoryEngine();
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 300 };
      const wall = createMockWall("wall1", { x: 50, y: 200 }, { x: 150, y: 200 });

      engine.setPlayer(player);
      engine.setCursor(cursor);
      engine.setAllSurfaces([wall]);

      const results = engine.getResults();

      // Should be blocked
      expect(results.actualPathUnified?.blockedBy).toBe(wall);
      expect(results.actualPathUnified?.reachedCursor).toBe(false);
    });
  });

  describe("cache invalidation", () => {
    it("should invalidate actualPathUnified when player moves", () => {
      const engine = new TrajectoryEngine();

      engine.setPlayer({ x: 100, y: 100 });
      engine.setCursor({ x: 200, y: 200 });
      engine.setAllSurfaces([]);

      const results1 = engine.getResults();
      const waypoints1 = results1.actualPathUnified?.waypoints;

      // Move player
      engine.setPlayer({ x: 150, y: 100 });
      const results2 = engine.getResults();
      const waypoints2 = results2.actualPathUnified?.waypoints;

      // Waypoints should be different
      expect(waypoints1?.[0]).toEqual({ x: 100, y: 100 });
      expect(waypoints2?.[0]).toEqual({ x: 150, y: 100 });
    });

    it("should invalidate actualPathUnified when surfaces change", () => {
      const engine = new TrajectoryEngine();
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 100, y: 300 };

      engine.setPlayer(player);
      engine.setCursor(cursor);
      engine.setAllSurfaces([]);

      const results1 = engine.getResults();
      expect(results1.actualPathUnified?.reachedCursor).toBe(true);

      // Add a wall
      const wall = createMockWall("wall1", { x: 50, y: 200 }, { x: 150, y: 200 });
      engine.setAllSurfaces([wall]);

      const results2 = engine.getResults();
      expect(results2.actualPathUnified?.reachedCursor).toBe(false);
    });
  });
});
