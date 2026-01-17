/**
 * Tests for Phase 11: USE_REFLECTED_TARGETS feature flag.
 *
 * Validates that visibility produces correct world-space polygons
 * regardless of feature flag state.
 */

import { describe, it, expect } from "vitest";
import { createMockBidirectionalSurface } from "@test/helpers/surfaceHelpers";
import { createReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import {
  createFullCone,
  createConeThroughWindow,
  projectConeV2,
  toVector2Array,
  USE_REFLECTED_TARGETS,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createReflectedTargetSet, type RayTarget } from "@/trajectory-v2/visibility/ReflectedTargets";
import { Endpoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

describe("Phase 11: USE_REFLECTED_TARGETS Feature Flag", () => {
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

  describe("feature flag exists", () => {
    it("should export USE_REFLECTED_TARGETS flag", () => {
      expect(typeof USE_REFLECTED_TARGETS).toBe("boolean");
    });

    it("should default to false for safety", () => {
      expect(USE_REFLECTED_TARGETS).toBe(false);
    });
  });

  describe("visibility with flag disabled (default)", () => {
    it("should produce valid polygons in world space", () => {
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const cache = createReflectionCache();
      const origin: Vector2 = { x: 200, y: 150 };

      const cone = createFullCone(origin);
      const sourcePoints = projectConeV2(
        cone,
        [screenChain],
        undefined,
        cache
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

    it("should produce correct polygon with Stage 2 (through window)", () => {
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const cache = createReflectionCache();
      const reflectionSurface = createHorizontalSurface("reflection", 150, 100, 300);

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

      // Should produce a valid polygon
      expect(vertices.length).toBeGreaterThanOrEqual(3);

      // All vertices should be in world space (within screen bounds)
      for (const v of vertices) {
        expect(v.x).toBeGreaterThanOrEqual(SCREEN_BOUNDS.minX - 1);
        expect(v.x).toBeLessThanOrEqual(SCREEN_BOUNDS.maxX + 1);
        expect(v.y).toBeGreaterThanOrEqual(SCREEN_BOUNDS.minY - 1);
        expect(v.y).toBeLessThanOrEqual(SCREEN_BOUNDS.maxY + 1);
      }
    });
  });

  describe("getTargetPosition behavior", () => {
    it("should use world-space targets when flag is disabled", () => {
      // This is implicitly tested by the visibility producing correct polygons
      // When USE_REFLECTED_TARGETS is false, targets use computeXY()
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const cache = createReflectionCache();
      const origin: Vector2 = { x: 200, y: 150 };

      const cone = createFullCone(origin);
      const sourcePoints = projectConeV2(
        cone,
        [screenChain],
        undefined,
        cache
      );

      // Polygon should exist and be valid
      expect(sourcePoints.length).toBeGreaterThan(0);
    });
  });
});
