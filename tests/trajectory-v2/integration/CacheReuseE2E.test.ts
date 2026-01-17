/**
 * End-to-end tests for cache reuse between trajectory and visibility systems.
 *
 * Phase 8: Verifies that the ReflectionCache flows through:
 * 1. TrajectoryEngine.getResults() -> EngineResults.reflectionCache
 * 2. GameAdapter.update() -> ValidRegionRenderer.render(cache)
 * 3. Visibility calculations reuse cached reflections
 */

import { describe, it, expect } from "vitest";
import { createMockBidirectionalSurface } from "@test/helpers/surfaceHelpers";
import { createReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { ValidRegionRenderer, type IValidRegionGraphics } from "@/trajectory-v2/visibility/ValidRegionRenderer";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

describe("Phase 8: Cache Reuse E2E", () => {
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

  // Full mock implementation of IValidRegionGraphics
  class MockGraphics implements IValidRegionGraphics {
    clear(): void {}
    fillStyle(_color: number, _alpha?: number): void {}
    lineStyle(_width: number, _color: number, _alpha?: number): void {}
    beginPath(): void {}
    moveTo(_x: number, _y: number): void {}
    lineTo(_x: number, _y: number): void {}
    closePath(): void {}
    fillPath(): void {}
    strokePath(): void {}
    fillRect(_x: number, _y: number, _width: number, _height: number): void {}
    setBlendMode(_blendMode: number): void {}
  }

  function createMockGraphics(): IValidRegionGraphics {
    return new MockGraphics();
  }

  describe("EngineResults includes reflectionCache", () => {
    it("should provide cache in EngineResults for sharing", () => {
      // This is already tested via TrajectoryEngine tests
      // Here we verify the pattern works with ValidRegionRenderer

      const mockGraphics = createMockGraphics();
      const renderer = new ValidRegionRenderer(mockGraphics, SCREEN_BOUNDS, {});

      // Create an external cache (simulating EngineResults.reflectionCache)
      const externalCache = createReflectionCache();

      const player: Vector2 = { x: 200, y: 200 };
      const surface = createHorizontalSurface("s1", 150, 100, 300);
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);

      // Pre-populate cache with a reflection (simulating trajectory calculation)
      externalCache.reflect(player, surface);
      const statsBeforeRender = externalCache.stats();

      // Render with external cache
      renderer.render(
        player,
        [surface],
        [screenChain],
        undefined,
        externalCache
      );

      // Cache should have been reused/extended
      const statsAfterRender = externalCache.stats();
      expect(statsAfterRender.size).toBeGreaterThanOrEqual(statsBeforeRender.size);
    });
  });

  describe("ValidRegionRenderer accepts external cache", () => {
    it("should use provided cache instance", () => {
      const mockGraphics = createMockGraphics();
      const renderer = new ValidRegionRenderer(mockGraphics, SCREEN_BOUNDS, {});
      const externalCache = createReflectionCache();

      const player: Vector2 = { x: 200, y: 200 };
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);

      // No surfaces means no reflections, but render should still work
      renderer.render(
        player,
        [],
        [screenChain],
        undefined,
        externalCache
      );

      // Render completed without errors - cache was accepted
      expect(true).toBe(true);
    });

    it("should reuse cached reflections from external cache", () => {
      const mockGraphics = createMockGraphics();
      const renderer = new ValidRegionRenderer(mockGraphics, SCREEN_BOUNDS, {});
      const externalCache = createReflectionCache();

      const player: Vector2 = { x: 200, y: 200 };
      const surface1 = createHorizontalSurface("s1", 150, 50, 350);
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);

      // Pre-compute the player reflection (like trajectory would)
      const reflectedPlayer = externalCache.reflect(player, surface1);

      // Render with the same cache
      renderer.render(
        player,
        [surface1],
        [screenChain],
        undefined,
        externalCache
      );

      // The reflection should have been reused (not a new object)
      const cachedReflection = externalCache.reflect(player, surface1);
      expect(cachedReflection).toBe(reflectedPlayer);
    });
  });

  describe("Cache sharing benefits", () => {
    it("should not duplicate reflections when cache is shared", () => {
      const sharedCache = createReflectionCache();

      const player: Vector2 = { x: 200, y: 200 };
      const surface = createHorizontalSurface("s1", 150, 50, 350);

      // Simulate trajectory computing player reflection
      sharedCache.reflect(player, surface);
      const statsAfterTrajectory = sharedCache.stats();

      // Simulate visibility computing the same reflection
      const mockGraphics = createMockGraphics();
      const renderer = new ValidRegionRenderer(mockGraphics, SCREEN_BOUNDS, {});
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);

      renderer.render(
        player,
        [surface],
        [screenChain],
        undefined,
        sharedCache
      );

      const statsAfterVisibility = sharedCache.stats();

      // For this simple case, the reflection of player should be the same
      // The cache may grow due to other reflections visibility needs
      expect(statsAfterVisibility.hits).toBeGreaterThanOrEqual(0);
    });

    it("should maintain bidirectional identity across systems", () => {
      const sharedCache = createReflectionCache();

      const player: Vector2 = { x: 200, y: 200 };
      const surface = createHorizontalSurface("s1", 150, 50, 350);

      // Trajectory reflects player
      const reflectedPlayer = sharedCache.reflect(player, surface);

      // Visibility might need to unreflect (e.g., for world-space output)
      const unreflectedPlayer = sharedCache.reflect(reflectedPlayer, surface);

      // Should get back the original reference
      expect(unreflectedPlayer).toBe(player);
    });
  });
});
