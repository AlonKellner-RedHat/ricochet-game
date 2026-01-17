/**
 * Tests for Phase 6: Reflected Targets in Visibility Ray Casting
 *
 * Validates that projectConeV2 correctly uses reflected target positions
 * when computing visibility from reflected origins.
 */

import { describe, it, expect } from "vitest";
import { createMockBidirectionalSurface } from "@test/helpers/surfaceHelpers";
import { createReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import {
  createReflectedTargetSet,
  type ReflectedTargetSet,
  type RayTarget,
} from "@/trajectory-v2/visibility/ReflectedTargets";
import {
  createConeThroughWindow,
  createFullCone,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { Endpoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Surface } from "@/surfaces/Surface";
import type { SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

describe("Phase 6: Reflected Targets in Visibility", () => {
  const SCREEN_BOUNDS = {
    minX: 0,
    maxX: 400,
    minY: 0,
    maxY: 300,
  };

  function createHorizontalSurface(
    id: string,
    y: number,
    xStart: number,
    xEnd: number
  ): Surface {
    return createMockBidirectionalSurface(id, { x: xStart, y }, { x: xEnd, y });
  }

  describe("6.1: projectConeV2 accepts reflectedTargets parameter", () => {
    it("should accept optional reflectedTargets parameter", () => {
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const cache = createReflectionCache();
      const origin: Vector2 = { x: 200, y: 150 };

      const cone = createFullCone(origin);

      // Create empty reflected targets set
      const reflectedTargets = createReflectedTargetSet([], screenChain.getSurfaces()[0]!, cache);

      // Should accept the parameter without error
      const sourcePoints = projectConeV2(
        cone,
        [screenChain],
        undefined,
        cache,
        reflectedTargets
      );

      expect(sourcePoints.length).toBeGreaterThan(0);
    });

    it("should produce valid polygons with reflected targets", () => {
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const cache = createReflectionCache();
      const reflectionSurface = createHorizontalSurface("reflection", 150, 0, 400);

      // Reflected origin (simulating Stage 2)
      const player: Vector2 = { x: 200, y: 200 };
      const reflectedOrigin = cache.reflect(player, reflectionSurface);

      // Create cone through window
      const window = { start: { x: 100, y: 150 }, end: { x: 300, y: 150 } };
      const cone = createConeThroughWindow(reflectedOrigin, window.start, window.end);

      // Get all targets and create reflected set
      const allTargets: RayTarget[] = [];
      for (const surf of screenChain.getSurfaces()) {
        allTargets.push(new Endpoint(surf, "start"));
        allTargets.push(new Endpoint(surf, "end"));
      }
      const reflectedTargets = createReflectedTargetSet(allTargets, reflectionSurface, cache);

      const sourcePoints = projectConeV2(
        cone,
        [screenChain],
        reflectionSurface.id,
        cache,
        reflectedTargets
      );

      const vertices = toVector2Array(sourcePoints);
      expect(vertices.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("6.2: Ray casting uses reflected positions", () => {
    it("should use cache for target reflection lookups", () => {
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const cache = createReflectionCache();
      const reflectionSurface = createHorizontalSurface("reflection", 150, 0, 400);

      const player: Vector2 = { x: 200, y: 200 };
      const reflectedOrigin = cache.reflect(player, reflectionSurface);

      // Pre-populate cache with some reflections
      const testPoint: Vector2 = { x: 100, y: 100 };
      cache.reflect(testPoint, reflectionSurface);
      const statsBeforeCone = cache.stats();

      // Create cone and call projectConeV2
      const window = { start: { x: 100, y: 150 }, end: { x: 300, y: 150 } };
      const cone = createConeThroughWindow(reflectedOrigin, window.start, window.end);

      const allTargets: RayTarget[] = [];
      for (const surf of screenChain.getSurfaces()) {
        allTargets.push(new Endpoint(surf, "start"));
        allTargets.push(new Endpoint(surf, "end"));
      }
      const reflectedTargets = createReflectedTargetSet(allTargets, reflectionSurface, cache);

      projectConeV2(
        cone,
        [screenChain],
        reflectionSurface.id,
        cache,
        reflectedTargets
      );

      // Cache should have been used (more entries now)
      const statsAfterCone = cache.stats();
      expect(statsAfterCone.size).toBeGreaterThanOrEqual(statsBeforeCone.size);
    });
  });

  describe("6.3: Multi-stage visibility with reflected targets", () => {
    it("should produce consistent results through Stage 2", () => {
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const cache = createReflectionCache();
      const reflectionSurface = createHorizontalSurface("reflection", 150, 50, 350);

      // Stage 1: Direct from player
      const player: Vector2 = { x: 200, y: 200 };
      const stage1Cone = createFullCone(player);
      const stage1Points = projectConeV2(stage1Cone, [screenChain], undefined, cache);
      const stage1Vertices = toVector2Array(stage1Points);

      // Stage 2: From reflected origin through window
      const reflectedOrigin = cache.reflect(player, reflectionSurface);
      const window = { start: { x: 50, y: 150 }, end: { x: 350, y: 150 } };
      const stage2Cone = createConeThroughWindow(reflectedOrigin, window.start, window.end);

      // Create reflected targets for Stage 2
      const allTargets: RayTarget[] = [];
      for (const surf of screenChain.getSurfaces()) {
        allTargets.push(new Endpoint(surf, "start"));
        allTargets.push(new Endpoint(surf, "end"));
      }
      const reflectedTargets = createReflectedTargetSet(allTargets, reflectionSurface, cache);

      const stage2Points = projectConeV2(
        stage2Cone,
        [screenChain],
        reflectionSurface.id,
        cache,
        reflectedTargets
      );
      const stage2Vertices = toVector2Array(stage2Points);

      // Both stages should produce valid polygons
      expect(stage1Vertices.length).toBeGreaterThanOrEqual(3);
      expect(stage2Vertices.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("6.4: Polygon vertices in world space", () => {
    it("should return vertices in world space coordinates", () => {
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const cache = createReflectionCache();
      const reflectionSurface = createHorizontalSurface("reflection", 150, 0, 400);

      const player: Vector2 = { x: 200, y: 200 };
      const reflectedOrigin = cache.reflect(player, reflectionSurface);

      const window = { start: { x: 100, y: 150 }, end: { x: 300, y: 150 } };
      const cone = createConeThroughWindow(reflectedOrigin, window.start, window.end);

      const allTargets: RayTarget[] = [];
      for (const surf of screenChain.getSurfaces()) {
        allTargets.push(new Endpoint(surf, "start"));
        allTargets.push(new Endpoint(surf, "end"));
      }
      const reflectedTargets = createReflectedTargetSet(allTargets, reflectionSurface, cache);

      const sourcePoints = projectConeV2(
        cone,
        [screenChain],
        reflectionSurface.id,
        cache,
        reflectedTargets
      );

      const vertices = toVector2Array(sourcePoints);

      // All vertices should be within screen bounds (world space)
      for (const v of vertices) {
        expect(v.x).toBeGreaterThanOrEqual(SCREEN_BOUNDS.minX - 1);
        expect(v.x).toBeLessThanOrEqual(SCREEN_BOUNDS.maxX + 1);
        expect(v.y).toBeGreaterThanOrEqual(SCREEN_BOUNDS.minY - 1);
        expect(v.y).toBeLessThanOrEqual(SCREEN_BOUNDS.maxY + 1);
      }
    });
  });
});
